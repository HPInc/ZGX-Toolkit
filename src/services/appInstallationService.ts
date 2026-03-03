/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Device } from '../types/devices';
import { SSHCommandResult } from '../types/ssh';
import { AppDefinition, getAllApps, getAppById } from '../constants/apps';
import { logger } from '../utils/logger';
import { getLastChars } from '../utils/string';
import { executeSSHCommand } from '../utils/sshConnection';

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

                result = await executeSSHCommand(
                    device,
                    sudoCommand,
                    { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: app.name, sudoPassword, retries: 3 }
                );
            } else {
                result = await executeSSHCommand(
                    device,
                    installCommand,
                    { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: app.name, sudoPassword, retries: 3 }
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
            const result = await executeSSHCommand(
                device,
                app.verifyCommand,
                { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                { operationName: app.name, timeoutSeconds: 7, retries: 3 }
            );
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
     * Validate a sudo password by attempting to run a test command
     */
    public async validatePassword(device: Device, password: string): Promise<boolean> {
        logger.info('Validating sudo password');

        // Use executeSSHCommand with a simple sudo test command
        const testCommand = 'sudo -S true';
        const result = await executeSSHCommand(
            device,
            testCommand,
            { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
            { operationName: 'sudo validation', sudoPassword: password, timeoutSeconds: 10, retries: 0 }
        );

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

                const condaEnvResult = await executeSSHCommand(
                    device,
                    'if [ -d "$HOME/miniforge3" ]; then $HOME/miniforge3/bin/conda env remove -n zgx -y 2>/dev/null || true; fi',
                    { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: 'Remove zgx conda env', sudoPassword: password, retries: 3 }
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

                result = await executeSSHCommand(
                    device,
                    sudoCommand,
                    { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: app.name, sudoPassword, retries: 3 }
                );
            } else {
                result = await executeSSHCommand(
                    device,
                    app.uninstallCommand,
                    { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: app.name, sudoPassword, retries: 3 }
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

