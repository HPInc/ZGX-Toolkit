/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Client as SSHClient, ClientChannel, ConnectConfig } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Device } from '../types/devices';
import { SSHCommandResult } from '../types/ssh';
import { AppDefinition, getAllApps, getAppById } from '../constants/apps';
import { logger } from '../utils/logger';
import { getLastChars } from '../utils/string';
import SSHConfig from 'ssh-config';

/**
 * Error types for installation/uninstallation operations.
 */
export enum InstallationErrorType {
    NONE = 'none',
    SUDO_PASSWORD_REQUIRED = 'sudo_password_required',
    INVALID_PASSWORD = 'invalid_password',
    INSTALLATION_FAILED = 'installation_failed',
    UNINSTALLATION_FAILED = 'uninstallation_failed',
    SYSTEM_STATE_INCONSISTENT = 'system_state_inconsistent',
    UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Progress callback for installation updates.
 */
export type InstallProgressCallback = (progress: {
    type: 'progress' | 'appStatus' | 'complete' | 'error';
    progress?: number;
    currentApp?: string;
    status?: string;
    appId?: string;
    installedApps?: string[];
    failedApps?: string[];
    message?: string;
}) => void;

/**
 * Progress callback for uninstallation updates.
 */
export type UninstallProgressCallback = (progress: {
    type: 'progress' | 'appStatus' | 'complete' | 'error';
    progress?: number;
    currentApp?: string;
    status?: string;
    appId?: string;
    uninstalledApps?: string[];
    failedApps?: string[];
    message?: string;
}) => void;

/**
 * Installation result.
 */
export interface InstallationResult {
    success: boolean;
    installedApps: string[];
    failedApps: string[];
    errorType?: InstallationErrorType;
    message?: string;
}

/**
 * Uninstallation result.
 */
export interface UninstallationResult {
    success: boolean;
    uninstalledApps: string[];
    failedApps: string[];
    errorType?: InstallationErrorType;
    message?: string;
}
/**
 * Service for managing application installation on remote devices.
 * Handles SSH command execution, dependency resolution, and progress tracking.
 * 
 * Note: This service does NOT store or cache passwords. The caller is responsible
 * for obtaining passwords via SudoPasswordService when needed.
 */
export class AppInstallationService {

    private readonly zgxPythonEnvId = 'zgx-python-env';
    public static readonly invalidPasswordMessage = "Invalid password. Please try again.";

    /**
     * Read SSH private key from file.
     */
    private readPrivateKey(keyPath: string): Buffer | undefined {
        try {
            const expandedPath = keyPath.replace(/^~/, os.homedir());
            if (fs.existsSync(expandedPath)) {
                return fs.readFileSync(expandedPath);
            }
        } catch (error) {
            logger.warn(`Failed to read private key from ${keyPath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return undefined;
    }

    /**
     * Get SSH configuration for a device.
     * Reads from ~/.ssh/config and merges with device properties.
     */
    private getSSHConfig(device: Device): ConnectConfig {
        const config: ConnectConfig = {
            host: device.host,
            port: device.port || 22,
            username: device.username,
            readyTimeout: 30000,
        };

        // Try to read SSH config file
        const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');

        if (fs.existsSync(sshConfigPath)) {
            try {
                const sshConfigContent = fs.readFileSync(sshConfigPath, 'utf-8');
                const parsedConfig = SSHConfig.parse(sshConfigContent);

                // Use compute method to get effective configuration for the host
                const hostConfig = parsedConfig.compute(device.host);

                if (hostConfig) {
                    logger.debug('Found SSH config for host', { host: device.host });

                    // Apply SSH config settings
                    if (hostConfig.HostName) {
                        if (typeof hostConfig.HostName === 'string') {
                            config.host = hostConfig.HostName;
                        } else {
                            config.host = hostConfig.HostName[0];
                        }
                    }

                    if (hostConfig.Port) {
                        if (typeof hostConfig.Port === 'string') {
                            config.port = parseInt(hostConfig.Port);
                        } else {
                            config.port = parseInt(hostConfig.Port[0]);
                        }
                    }

                    if (hostConfig.User) {
                        if (typeof hostConfig.User === 'string') {
                            config.username = hostConfig.User;
                        } else {
                            config.username = hostConfig.User[0];
                        }
                    }

                    if (hostConfig.IdentityFile) {
                        // IdentityFile can be a string or array
                        const identityFiles = Array.isArray(hostConfig.IdentityFile)
                            ? hostConfig.IdentityFile
                            : [hostConfig.IdentityFile];

                        // Try each identity file until we find one that exists
                        for (const keyPath of identityFiles) {
                            const privateKey = this.readPrivateKey(keyPath);
                            if (privateKey) {
                                config.privateKey = privateKey;
                                logger.debug('Using identity file from SSH config', { path: keyPath });
                                break;
                            }
                        }
                    }

                    // Check IdentitiesOnly setting (may be undefined, string, or array)
                    let identitiesOnly = "";
                    if (hostConfig.IdentitiesOnly) {
                        if (typeof hostConfig.IdentitiesOnly === 'string') {
                            identitiesOnly = hostConfig.IdentitiesOnly;
                        } else if (Array.isArray(hostConfig.IdentitiesOnly) && hostConfig.IdentitiesOnly.length > 0) {
                            identitiesOnly = hostConfig.IdentitiesOnly[0];
                        }

                        if (identitiesOnly.toLowerCase() === 'yes') {
                            // Don't use agent if IdentitiesOnly is set
                            delete config.agent;
                        }
                    }
                }
            } catch (error) {
                logger.warn('Failed to parse SSH config', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Try common identity file locations if no key specified
        if (!config.privateKey && !config.agent) {
            const commonKeys = [
                path.join(os.homedir(), '.ssh', 'id_ed25519'),
                path.join(os.homedir(), '.ssh', 'id_rsa'),
                path.join(os.homedir(), '.ssh', 'id_ecdsa'),
            ];

            for (const keyPath of commonKeys) {
                const privateKey = this.readPrivateKey(keyPath);
                if (privateKey) {
                    config.privateKey = privateKey;
                    logger.debug('Using default identity file', { path: keyPath });
                    break;
                }
            }
        }

        // Fall back to SSH agent if no private key found
        if (!config.privateKey && process.env.SSH_AUTH_SOCK) {
            config.agent = process.env.SSH_AUTH_SOCK;
            logger.debug('Using SSH agent for authentication');
        }

        return config;
    }

    /**
     * Create and connect an SSH client to the device.
     */
    private async createSSHConnection(device: Device): Promise<SSHClient> {
        return new Promise((resolve, reject) => {
            const client = new SSHClient();

            client.on('ready', () => {
                resolve(client);
            });

            client.on('error', (err) => {
                reject(err);
            });

            // Get SSH configuration including credentials from ~/.ssh/config
            const config = this.getSSHConfig(device);

            logger.debug('Connecting to SSH host', {
                host: config.host,
                port: config.port,
                username: config.username,
                hasPrivateKey: !!config.privateKey,
                hasAgent: !!config.agent
            });

            client.connect(config);
        });
    }

    /**
     * Install selected applications on a device.
     * 
     * @param device The target device
     * @param selectedApps Array of app IDs to install
     * @param progressCallback Callback for progress updates
     * @param sudoPassword Sudo password if required (caller must provide if any apps need sudo)
     * @returns Installation result
     */
    public async installApplications(
        device: Device,
        selectedApps: string[],
        progressCallback: InstallProgressCallback,
        sudoPassword?: string
    ): Promise<InstallationResult> {
        logger.info('Starting application installation process', {
            device: device.name,
            appCount: selectedApps.length
        });

        try {
            // Get app definitions for selected apps
            const allApps = getAllApps();
            const appsToInstall = allApps.filter(app => selectedApps.includes(app.id));

            // Sort apps by dependencies to ensure dependencies are installed first
            const sortedApps = this.sortAppsByDependencies(appsToInstall);

            // Check if any apps require sudo
            const requiresSudo = sortedApps.some(app => app.installCommand.includes('sudo'));

            if (requiresSudo && !sudoPassword) {
                logger.warn('Sudo required but no password provided');
                return {
                    success: false,
                    installedApps: [],
                    failedApps: selectedApps,
                    errorType: InstallationErrorType.SUDO_PASSWORD_REQUIRED,
                    message: 'Sudo password required for installation'
                };
            }

            // Validate sudo password if provided
            if (requiresSudo && sudoPassword) {
                const isValid = await this.validatePassword(device, sudoPassword);
                if (!isValid) {
                    logger.error('Password validation failed');
                    return {
                        success: false,
                        installedApps: [],
                        failedApps: selectedApps,
                        errorType: InstallationErrorType.INVALID_PASSWORD,
                        message: AppInstallationService.invalidPasswordMessage
                    };
                }
                
                logger.info('Password validated successfully');
            }

            // Prepare for installation
            const newlyInstalled: string[] = [];
            const failedApps: string[] = [];

            // Notify progress start
            progressCallback({
                type: 'progress',
                progress: 0,
                currentApp: '',
                status: 'Preparing installation...'
            });

            // Install base system first if not already installed
            const baseSystemApp = allApps.find(app => app.id === 'base-system');
            if (baseSystemApp && !await this.verifyAppInstallation(device, baseSystemApp)) {
                const success = await this.installSingleApp(
                    device,
                    baseSystemApp,
                    0,
                    sortedApps.length + 1,
                    progressCallback,
                    sudoPassword
                );

                if (success) {
                    newlyInstalled.push('base-system');
                } else {
                    failedApps.push('base-system');
                }
            }

            // Install selected applications sequentially in dependency order
            let currentIndex = 0;
            for (const app of sortedApps) {
                currentIndex++;

                await this.verifyAppInstallation(device, app).then(async alreadyInstalled => {
                    if (alreadyInstalled) {
                        // App already installed, just update progress
                        const progress = (currentIndex / sortedApps.length) * 100;
                        progressCallback({
                            type: 'progress',
                            progress: progress,
                            currentApp: app.name,
                            status: 'Already installed'
                        });
                        progressCallback({
                            type: 'appStatus',
                            appId: app.id,
                            status: 'Already installed'
                        });
                    } else {
                        const success = await this.installSingleApp(
                            device,
                            app,
                            currentIndex,
                            sortedApps.length,
                            progressCallback,
                            sudoPassword
                        );

                        if (success) {
                            newlyInstalled.push(app.id);
                        } else {
                            failedApps.push(app.id);
                        }
                    }
                });
            }

            // Notify completion
            progressCallback({
                type: 'complete',
                installedApps: newlyInstalled,
                failedApps: failedApps
            });

            logger.info('Application installation completed', {
                installed: newlyInstalled.length,
                failed: failedApps.length
            });

            return {
                success: failedApps.length === 0,
                installedApps: newlyInstalled,
                failedApps: failedApps,
                errorType: failedApps.length === 0 ? InstallationErrorType.NONE : InstallationErrorType.INSTALLATION_FAILED,
                message: failedApps.length === 0
                    ? 'All applications installed successfully'
                    : `${newlyInstalled.length} installed, ${failedApps.length} failed`
            };

        } catch (error) {
            logger.error('Installation process failed', {
                error: error instanceof Error ? error.message : String(error)
            });

            progressCallback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });

            return {
                success: false,
                installedApps: [],
                failedApps: selectedApps,
                errorType: InstallationErrorType.INSTALLATION_FAILED,
                message: error instanceof Error ? error.message : 'Installation failed'
            };
        }
    }

    /**
     * Install a single application.
     */
    private async installSingleApp(
        device: Device,
        app: AppDefinition,
        currentIndex: number,
        totalApps: number,
        progressCallback: InstallProgressCallback,
        sudoPassword?: string
    ): Promise<boolean> {
        const progress = (currentIndex / totalApps) * 100;

        logger.info(`Installing ${app.name} (${app.id})`);

        // Update progress
        progressCallback({
            type: 'progress',
            progress: progress,
            currentApp: app.name,
            status: `Checking ${app.name}...`
        });

        progressCallback({
            type: 'appStatus',
            appId: app.id,
            status: 'Installing'
        });

        try {
            // First, check if the app is already installed
            logger.debug(`Checking if ${app.name} is already installed`);
            const alreadyInstalled = await this.verifyAppInstallation(device, app);

            if (alreadyInstalled) {
                logger.info(`${app.name} is already installed, skipping installation`);
                progressCallback({
                    type: 'appStatus',
                    appId: app.id,
                    status: 'Completed'
                });
                progressCallback({
                    type: 'progress',
                    progress: progress,
                    currentApp: app.name,
                    status: `${app.name} already installed ✓`
                });
                return true;
            }

            // App is not installed, proceed with installation
            logger.info(`${app.name} not found, proceeding with installation`);
            progressCallback({
                type: 'progress',
                progress: progress,
                currentApp: app.name,
                status: `Installing ${app.name}...`
            });

            // Execute installation command
            const installCommand = app.installCommand;
            const requiresSudo = installCommand.includes('sudo');

            let result: SSHCommandResult;

            if (requiresSudo && sudoPassword) {
                // For sudo commands, wrap in single sudo bash -c
                const commandWithoutSudo = installCommand.replace(/sudo\s+/g, '');
                const sudoCommand = `sudo -S bash -c ${this.escapeShellArg(commandWithoutSudo)}`;

                result = await this.executeSSHCommand(
                    device,
                    sudoCommand,
                    app.name,
                    sudoPassword
                );
            } else {
                result = await this.executeSSHCommand(
                    device,
                    installCommand,
                    app.name,
                    sudoPassword
                );
            }

            if (result.success) {
                // Confirm installation
                const isInstalled = await this.verifyAppInstallation(device, app);

                if (isInstalled) {
                    progressCallback({
                        type: 'appStatus',
                        appId: app.id,
                        status: 'Completed'
                    });
                    logger.info(`Successfully installed ${app.name}`);
                    return true;
                } else {
                    progressCallback({
                        type: 'appStatus',
                        appId: app.id,
                        status: 'Failed'
                    });
                    logger.warn(`Failed to verify installation of ${app.name}`);
                    return false;
                }
            } else {
                progressCallback({
                    type: 'appStatus',
                    appId: app.id,
                    status: 'Failed'
                });
                logger.warn(`Installation command failed for ${app.name}`, { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
                return false;
            }

        } catch (error) {
            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status: 'Failed'
            });
            logger.error(`Installation failed for ${app.name}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Verify that an application is installed.
     */
    public async verifyAppInstallation(device: Device, app: AppDefinition): Promise<boolean> {
        logger.debug(`Verifying installation of ${app.name}`);

        try {
            // We should never need sudo for verification commands
            const result = await this.executeSSHCommand(device, app.verifyCommand, app.name, undefined, 7);
            if (!result.success && result.error) {
                logger.error('App verification failed', { device: device.name, error: result.error.message, stderr: result.stderr, stdout: result.stdout });
            }
            return result.success;
        } catch (error) {
            logger.error(`Verification exception for ${app.name}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Execute SSH command and return detailed result.
     */
    private async executeSSHCommand(
        device: Device,
        command: string,
        appName: string,
        sudoPassword?: string,
        timeoutSeconds?: number,
        numRetries: number = 3
    ): Promise<SSHCommandResult> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= numRetries; attempt++) {
            let client: SSHClient | undefined;

            try {
                const attemptText = timeoutSeconds && attempt > 1 ? ` (attempt ${attempt}/${numRetries})` : '';
                logger.debug(`Executing SSH command for ${appName}${attemptText}`);

                // Connect to device
                client = await this.createSSHConnection(device);

                const result = await new Promise<SSHCommandResult>((resolve, reject) => {
                    let timeoutHandle: NodeJS.Timeout | undefined;
                    let resolved = false;

                    const cleanup = () => {
                        if (timeoutHandle) {
                            clearTimeout(timeoutHandle);
                        }
                    };

                    const safeResolve = (value: SSHCommandResult) => {
                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            resolve(value);
                        }
                    };

                    const safeReject = (error: Error) => {
                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            reject(error);
                        }
                    };

                    // Set up timeout if specified
                    if (timeoutSeconds) {
                        timeoutHandle = setTimeout(() => {
                            safeReject(new Error(`SSH command timed out after ${timeoutSeconds} seconds`));
                        }, timeoutSeconds * 1000);
                    }

                    client!.exec(command, (err, stream) => {
                        if (err) {
                            safeReject(err);
                            return;
                        }

                        let stdout = '';
                        let stderr = '';

                        stream.on('data', (data: Buffer) => {
                            stdout += data.toString();
                        });

                        stream.stderr.on('data', (data: Buffer) => {
                            stderr += data.toString();
                        });

                        stream.on('close', (code: number, signal?: string) => {
                            let exitCode: number;
                            if (code === null || code === undefined) {
                                logger.warn(`Stream closed without providing an exit code for ${appName}. Defaulting to exit code 1.`, {
                                    signal,
                                    stdout: getLastChars(stdout),
                                    stderr: getLastChars(stderr)
                                });
                                exitCode = 1;
                            } else {
                                exitCode = code;
                            }
                            logger.debug(`Command completed for ${appName}`, {
                                exitCode,
                                signal,
                                stdout: getLastChars(stdout),
                                stderr: getLastChars(stderr)
                            });

                            safeResolve({
                                success: exitCode === 0,
                                exitCode,
                                stdout,
                                stderr
                            });
                        });

                        stream.on('error', (err: Error) => {
                            logger.error(`Stream error for ${appName}`, { error: err.message });
                            safeReject(err);
                        });

                        // If password is provided and command is sudo, write it to stdin and close stdin
                        if (sudoPassword && command.startsWith('sudo -S')) {
                            stream.write(sudoPassword + '\n', (err) => {
                                if (err) {
                                    logger.error(`Failed to write sudo password for ${appName}`, { error: err.message });
                                    safeReject(err);
                                    return;
                                }
                                stream.end();
                            });
                        } else {
                            // No password needed, just close stdin
                            stream.end();
                        }
                    });
                });

                return result;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (error instanceof Error && (error.message.includes('timed out') || error.message.includes('ECONNRESET'))) {
                    logger.warn(`Command error for ${appName} (attempt ${attempt}/${numRetries})`, {
                        error: error.message
                    });

                    // Retry on timeout or connection reset
                    if (attempt < numRetries) {
                        logger.info(`Retrying command for ${appName}...`);
                        // Add a small delay before retry
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }

                // For non-retryable errors, don't retry
                logger.error(`Command exception for ${appName}`, {
                    error: error instanceof Error ? error.message : String(error)
                });

                // Return error result - SSH connection itself failed
                return {
                    success: false,
                    exitCode: -1,
                    stdout: '',
                    stderr: '',
                    error: lastError
                };
            } finally {
                // Always close the client connection with a small delay
                if (client) {
                    try {
                        client.end();
                    } catch (err) {
                        logger.debug(`Error closing SSH client for ${appName}`, {
                            error: err instanceof Error ? err.message : String(err)
                        });
                    }
                }
            }
        }

        // All retries exhausted
        logger.error(`Command failed for ${appName} after ${numRetries} attempts`, {
            lastError: lastError?.message
        });

        return {
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: '',
            error: lastError
        };
    }

    /**
     * Validate sudo password by executing a simple sudo command.
     * Uses executeSSHCommand internally.
     */
    /**
     * Validate a sudo password by attempting to run a test command
     */
    public async validatePassword(device: Device, password: string): Promise<boolean> {
        logger.info('Validating sudo password');

        // Use executeSSHCommand with a simple sudo test command
        const testCommand = 'sudo -S true';
        const result = await this.executeSSHCommand(device, testCommand, 'sudo validation', password, 10, 1);

        if (!result.success) {
            logger.error('Sudo password validation failed', { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
        }
        return result.success;
    }

    /**
     * Sort apps by dependencies so dependencies are installed first.
     */
    public sortAppsByDependencies(apps: AppDefinition[]): AppDefinition[] {
        const sorted: AppDefinition[] = [];
        const visited = new Set<string>();

        const visit = (app: AppDefinition) => {
            if (visited.has(app.id)) {
                return;
            }

            visited.add(app.id);

            // Visit dependencies first
            if (app.dependencies) {
                for (const depId of app.dependencies) {
                    const depApp = apps.find(a => a.id === depId);
                    if (depApp && !visited.has(depId)) {
                        visit(depApp);
                    }
                }
            }

            sorted.push(app);
        };

        for (const app of apps) {
            visit(app);
        }

        logger.debug('Apps sorted by dependencies', {
            order: sorted.map(a => a.id)
        });

        return sorted;
    }

    /**
     * Escape shell argument for safe command execution.
     */
    private escapeShellArg(arg: string): string {
        return `'${arg.replace(/'/g, "'\\''")}'`;
    }

    /**
     * Uninstall selected applications from a device.
     * 
     * @param device The target device
     * @param selectedApps Array of app IDs to uninstall (or all except base-system if not provided)
     * @param progressCallback Callback for progress updates
     * @param password Sudo password if required (caller must provide if any apps need sudo)
     * @returns Uninstallation result
     */
    public async uninstallApplications(
        device: Device,
        selectedApps: string[],
        progressCallback?: UninstallProgressCallback,
        password?: string
    ): Promise<UninstallationResult> {
        logger.info('Starting application uninstallation process', {
            device: device.name,
            appCount: selectedApps?.length || 'all'
        });

        try {
            // Determine which apps to uninstall
            const appsToUninstall = selectedApps; // || this.getAppsForUninstallation(device);

            if (appsToUninstall.length === 0) {
                logger.info('No applications to uninstall');
                return {
                    success: true,
                    uninstalledApps: [],
                    failedApps: [],
                    errorType: InstallationErrorType.NONE,
                    message: 'No applications to uninstall'
                };
            }

            // Get app definitions
            const allApps = getAllApps();
            const appsToUninstallDefs = allApps.filter(app => appsToUninstall.includes(app.id));

            // Sort apps for uninstallation (reverse dependency order)
            const sortedApps = this.sortAppsForUninstallation(appsToUninstallDefs);

            // Check if any apps require sudo
            const requiresSudo = sortedApps.some(app =>
                app.uninstallCommand && app.uninstallCommand.includes('sudo')
            );

            if (requiresSudo && !password) {
                logger.warn('Sudo required but no password provided');
                return {
                    success: false,
                    uninstalledApps: [],
                    failedApps: appsToUninstall,
                    errorType: InstallationErrorType.SUDO_PASSWORD_REQUIRED,
                    message: 'Sudo password required for uninstallation'
                };
            }

            // Validate sudo password if provided (same as install flow)
            if (requiresSudo && password) {
                const isValid = await this.validatePassword(device, password);
                if (!isValid) {
                    logger.error('Password validation failed during uninstallation');
                    return {
                        success: false,
                        uninstalledApps: [],
                        failedApps: appsToUninstall,
                        errorType: InstallationErrorType.INVALID_PASSWORD,
                        message: AppInstallationService.invalidPasswordMessage
                    };
                }
                
                logger.info('Password validated successfully');
            }

            const successfullyUninstalled: string[] = [];
            const failedUninstalls: string[] = [];

            // Notify progress start
            if (progressCallback) {
                progressCallback({
                    type: 'progress',
                    progress: 0,
                    currentApp: '',
                    status: 'Preparing uninstallation...'
                });
            }

            // Check if we need to remove the Conda environment
            // If we do, we can remove it and apps that use it at once to speed things up
            const hasZgxCondaEnvironment = sortedApps.some(app => app.id === this.zgxPythonEnvId);

            if (hasZgxCondaEnvironment) {
                logger.info('Removing ZGX Python Environment');

                if (progressCallback) {
                    progressCallback({
                        type: 'progress',
                        progress: 0,
                        currentApp: 'ZGX Python Environment',
                        status: 'Removing ZGX Python Environment...'
                    });
                }

                const condaEnvResult = await this.executeSSHCommand(
                    device,
                    'if [ -d "$HOME/miniforge3" ]; then $HOME/miniforge3/bin/conda env remove -n zgx -y 2>/dev/null || true; fi',
                    'Remove zgx conda env',
                    password
                );

                if (condaEnvResult.success) {
                    successfullyUninstalled.push(this.zgxPythonEnvId);
                    logger.info('Successfully removed ZGX Python Environment');
                    // Mark all Python Tools as successfully uninstalled
                    const pythonToolApps = sortedApps.filter(app => app.dependencies?.includes(this.zgxPythonEnvId));
                    for (const app of pythonToolApps) {
                        successfullyUninstalled.push(app.id);
                        if (progressCallback) {
                            progressCallback({
                                type: 'appStatus',
                                appId: app.id,
                                status: 'Completed'
                            });
                        }
                    }
                } else {
                    logger.warn('Failed to remove ZGX Python Environment');
                    // Mark Python Tools as failed
                    const pythonToolApps = sortedApps.filter(app => app.dependencies?.includes(this.zgxPythonEnvId));
                    for (const app of pythonToolApps) {
                        failedUninstalls.push(app.id);
                        if (progressCallback) {
                            progressCallback({
                                type: 'appStatus',
                                appId: app.id,
                                status: 'Failed'
                            });
                        }
                    }
                }
            }

            // Uninstall each app sequentially
            let currentIndex = 0;
            for (const app of sortedApps) {
                currentIndex++;

                if (hasZgxCondaEnvironment && (app.id === this.zgxPythonEnvId || app.dependencies?.includes(this.zgxPythonEnvId))) {
                    // Already handled with conda env removal
                    continue;
                }

                // Skip if app doesn't have uninstall command (like base-system)
                if (!app.uninstallCommand) {
                    logger.debug(`Skipping ${app.name} - no uninstall command defined`);
                    continue;
                }

                const success = await this.uninstallSingleApp(
                    device,
                    app,
                    currentIndex,
                    sortedApps.length,
                    progressCallback,
                    password
                );

                if (success) {
                    successfullyUninstalled.push(app.id);
                } else {
                    failedUninstalls.push(app.id);
                }
            }

            // Notify completion
            if (progressCallback) {
                progressCallback({
                    type: 'complete',
                    uninstalledApps: successfullyUninstalled,
                    failedApps: failedUninstalls
                });
            }

            logger.info('Application uninstallation completed', {
                uninstalled: successfullyUninstalled.length,
                failed: failedUninstalls.length
            });

            return {
                success: failedUninstalls.length === 0,
                uninstalledApps: successfullyUninstalled,
                failedApps: failedUninstalls,
                errorType: failedUninstalls.length === 0 ? InstallationErrorType.NONE : InstallationErrorType.UNINSTALLATION_FAILED,
                message: failedUninstalls.length === 0
                    ? 'All applications uninstalled successfully'
                    : `${successfullyUninstalled.length} uninstalled, ${failedUninstalls.length} failed`
            };

        } catch (error) {
            logger.error('Uninstallation process failed', {
                error: error instanceof Error ? error.message : String(error)
            });

            if (progressCallback) {
                progressCallback({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            return {
                success: false,
                uninstalledApps: [],
                failedApps: selectedApps || [],
                errorType: InstallationErrorType.UNINSTALLATION_FAILED,
                message: error instanceof Error ? error.message : 'Uninstallation failed'
            };
        }
    }

    /**
     * Uninstall a single application.
     */
    private async uninstallSingleApp(
        device: Device,
        app: AppDefinition,
        currentIndex: number,
        totalApps: number,
        progressCallback?: UninstallProgressCallback,
        sudoPassword?: string
    ): Promise<boolean> {
        const progress = (currentIndex / totalApps) * 100;

        logger.info(`Uninstalling ${app.name} (${app.id})`);

        // Update progress
        if (progressCallback) {
            progressCallback({
                type: 'progress',
                progress: progress,
                currentApp: app.name,
                status: `Uninstalling ${app.name}...`
            });

            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status: 'Uninstalling'
            });
        }

        try {
            if (!app.uninstallCommand) {
                logger.debug(`${app.name} has no uninstall command, skipping`);
                return true;
            }

            const requiresSudo = app.uninstallCommand.includes('sudo');
            let result: SSHCommandResult;

            if (requiresSudo && sudoPassword) {
                // For sudo commands, wrap in single sudo -S command
                const commandWithoutSudo = app.uninstallCommand.replace(/sudo\s+/g, '');
                const sudoCommand = `sudo -S bash -c ${this.escapeShellArg(commandWithoutSudo)}`;

                result = await this.executeSSHCommand(
                    device,
                    sudoCommand,
                    app.name,
                    sudoPassword
                );
            } else {
                result = await this.executeSSHCommand(
                    device,
                    app.uninstallCommand,
                    app.name,
                    sudoPassword
                );
            }

            if (result.success) {
                if (progressCallback) {
                    progressCallback({
                        type: 'appStatus',
                        appId: app.id,
                        status: 'Completed'
                    });
                }
                logger.info(`Successfully uninstalled ${app.name}`);
                return true;
            } else {
                if (progressCallback) {
                    progressCallback({
                        type: 'appStatus',
                        appId: app.id,
                        status: 'Failed'
                    });
                }
                logger.warn(`Failed to uninstall ${app.name}`, { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
                return false;
            }

        } catch (error) {
            if (progressCallback) {
                progressCallback({
                    type: 'appStatus',
                    appId: app.id,
                    status: 'Failed'
                });
            }
            logger.error(`Uninstallation failed for ${app.name}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Get list of apps that can be uninstalled from a device.
     * Filters out base-system which should NEVER be uninstalled.
     */
    // public getAppsForUninstallation(device: Device): string[] {
    //     const installedApps = device.installedApps || [];
    //     // Filter out base-system - it should NEVER be uninstalled
    //     return installedApps.filter(id => id !== 'base-system');
    // }

    /**
     * Sort apps for uninstallation in reverse dependency order.
     * Python tools first, then miniforge, then system stack apps.
     * Apps that depend on others are uninstalled before their dependencies.
     */
    public sortAppsForUninstallation(apps: AppDefinition[]): AppDefinition[] {
        // Separate into categories
        const pythonTools = apps.filter(app => app.category === 'python-tools');
        const miniforge = apps.find(app => app.id === 'miniforge');
        const systemStack = apps.filter(app => app.category === 'system-stack' && app.id !== 'miniforge');

        // Build result: Python Tools -> Miniforge -> System Stack (reverse dependency order)
        const result: AppDefinition[] = [];

        // Add Python Tools first (they depend on miniforge)
        result.push(...pythonTools);

        // Add Miniforge
        if (miniforge) {
            result.push(miniforge);
        }

        // Add System Stack apps in reverse dependency order
        // Apps with dependencies should be removed before their dependencies
        const sortedSystemStack = this.reverseDependencySort(systemStack);
        result.push(...sortedSystemStack);

        logger.debug('Apps sorted for uninstallation', {
            order: result.map(a => a.id)
        });

        return result;
    }

    /**
     * Reverse topological sort - apps with dependencies come first.
     * This ensures apps that depend on others are uninstalled before their dependencies.
     */
    private reverseDependencySort(apps: AppDefinition[]): AppDefinition[] {
        const sorted: AppDefinition[] = [];
        const visited = new Set<string>();

        const visit = (app: AppDefinition) => {
            if (visited.has(app.id)) {
                return;
            }

            visited.add(app.id);

            // Find apps that depend on this app
            const dependents = apps.filter(a =>
                a.dependencies && a.dependencies.includes(app.id) && !visited.has(a.id)
            );

            // Visit dependents first (they should be uninstalled before this app)
            for (const dependent of dependents) {
                visit(dependent);
            }

            sorted.push(app);
        };

        for (const app of apps) {
            visit(app);
        }

        return sorted;
    }
}

