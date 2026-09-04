/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Device } from '../types/devices';
import { SSHCommandResult } from '../types/ssh';
import { AppDefinition, AppPreInstallCheck, getAllApps } from '../constants/apps';
import { logger } from '../utils/logger';
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
    PRE_INSTALL_CHECK_FAILED = 'pre_install_check_failed',
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
    /** Per-app failure reason (e.g. a pre-install check's failMessage), keyed by app id */
    failureReasons?: Record<string, string>;
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
 * Mutable accumulator used internally while installing a batch of apps, tracking
 * which apps succeeded/failed and why. Bundled into a single object (rather than
 * passed as separate parameters) to keep helper method signatures small.
 */
interface InstallAccumulator {
    newlyInstalled: string[];
    failedApps: string[];
    failureReasons: Record<string, string>;
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
    public static readonly invalidPasswordMessage = 'Invalid password. Please try again.';

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

            const sudoValidationError = await this.validateSudoRequirements(device, sortedApps, selectedApps, sudoPassword);
            if (sudoValidationError) {
                return sudoValidationError;
            }

            // Prepare for installation
            const accumulator: InstallAccumulator = {
                newlyInstalled: [],
                failedApps: [],
                failureReasons: {}
            };

            // Notify progress start
            progressCallback({
                type: 'progress',
                progress: 0,
                currentApp: '',
                status: 'Preparing installation...'
            });

            // Install base system first if not already installed
            await this.installBaseSystemIfNeeded(
                device,
                allApps,
                sortedApps,
                progressCallback,
                sudoPassword,
                accumulator
            );

            // Install selected applications sequentially in dependency order.
            // installSingleApp() checks whether the app is already installed
            // internally and returns true in that case. If checked here it would 
            // only send progress callbacks without pushing the app's id into
            // newlyInstalled/failedApps, causing it to silently disappear from 
            // both lists on the Application Install Complete screen.
            await this.installAppsInOrder(
                device,
                sortedApps,
                progressCallback,
                sudoPassword,
                accumulator
            );

            const { newlyInstalled, failedApps, failureReasons } = accumulator;

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
                    : `${newlyInstalled.length} installed, ${failedApps.length} failed`,
                failureReasons: Object.keys(failureReasons).length > 0 ? failureReasons : undefined
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
     * Ensure sudo password requirements are satisfied before installing.
     * Returns an InstallationResult describing the failure if validation fails,
     * or undefined if installation can proceed.
     */
    private async validateSudoRequirements(
        device: Device,
        sortedApps: AppDefinition[],
        selectedApps: string[],
        sudoPassword?: string
    ): Promise<InstallationResult | undefined> {
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

        return undefined;
    }

    /**
     * Install the base-system app first if it isn't already installed, recording
     * the outcome into the shared accumulator (newlyInstalled/failedApps/failureReasons).
     */
    private async installBaseSystemIfNeeded(
        device: Device,
        allApps: AppDefinition[],
        sortedApps: AppDefinition[],
        progressCallback: InstallProgressCallback,
        sudoPassword: string | undefined,
        accumulator: InstallAccumulator
    ): Promise<void> {
        const baseSystemApp = allApps.find(app => app.id === 'base-system');
        if (!baseSystemApp || (await this.verifyAppInstallation(device, baseSystemApp)).isInstalled) {
            return;
        }

        const { success, failureReason } = await this.installSingleApp(
            device,
            baseSystemApp,
            0,
            sortedApps.length + 1,
            progressCallback,
            sudoPassword
        );

        if (success) {
            accumulator.newlyInstalled.push('base-system');
        } else {
            accumulator.failedApps.push('base-system');
            if (failureReason) {
                accumulator.failureReasons['base-system'] = failureReason;
            }
        }
    }

    /**
     * Install each app in sortedApps sequentially, recording the outcome into
     * the shared accumulator (newlyInstalled/failedApps/failureReasons).
     */
    private async installAppsInOrder(
        device: Device,
        sortedApps: AppDefinition[],
        progressCallback: InstallProgressCallback,
        sudoPassword: string | undefined,
        accumulator: InstallAccumulator
    ): Promise<void> {
        let currentIndex = 0;
        for (const app of sortedApps) {
            currentIndex++;

            const { success, failureReason } = await this.installSingleApp(
                device,
                app,
                currentIndex,
                sortedApps.length,
                progressCallback,
                sudoPassword
            );

            if (success) {
                accumulator.newlyInstalled.push(app.id);
            } else {
                accumulator.failedApps.push(app.id);
                if (failureReason) {
                    accumulator.failureReasons[app.id] = failureReason;
                }
            }
        }
    }

    /**
     * Run all pre-install checks defined for an app against the target device.
     * Blocking checks that fail cause the overall result to fail immediately.
     * Warning checks that fail are collected and returned but do not fail the result.
     */
    private async runPreInstallChecks(
        device: Device,
        app: AppDefinition
    ): Promise<{ passed: boolean; warnings: string[]; failMessage?: string }> {
        const warnings: string[] = [];

        for (const check of app.preInstallChecks ?? []) {
            const severity = check.severity ?? 'blocking';

            try {
                const result = await executeSSHCommand(
                    device,
                    check.command,
                    { timeout: 15000, readyTimeout: 15000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                    { operationName: check.id, retries: 1 }
                );

                const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
                const checkPassed = this.evaluatePreInstallCheck(result, output, check);

                if (!checkPassed) {
                    logger.warn(`Pre-install check '${check.id}' failed`, {
                        error: result.error?.message,
                        stderr: result.stderr,
                        stdout: result.stdout
                    });

                    if (severity === 'blocking') {
                        return { passed: false, warnings, failMessage: check.failMessage };
                    }
                    warnings.push(check.failMessage);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`Pre-install check '${check.id}' threw an error`, { error: message });

                if (severity === 'blocking') {
                    return { passed: false, warnings, failMessage: check.failMessage };
                }
                warnings.push(check.failMessage);
            }
        }

        return { passed: true, warnings };
    }

    /**
     * Determine whether a pre-install check succeeded, based on the command's
     * result and (if the check specifies a minVersion) a version comparison.
     */
    private evaluatePreInstallCheck(result: SSHCommandResult, output: string, check: AppPreInstallCheck): boolean {
        if (!result.success) {
            return false;
        }

        if (check.minVersion) {
            const detectedVersion = this.extractVersion(output);
            if (!detectedVersion) {
                return false;
            }
            return this.compareVersions(detectedVersion, check.minVersion) >= 0;
        }

        return true;
    }

    /**
     * Extract the first semantic-version-like string from text.
     */
    private extractVersion(text: string): string | undefined {
        const versionPattern = /\d{1,9}\.\d{1,9}(?:\.\d{1,9})?(?:\.\d{1,9})?/;
        const match = versionPattern.exec(text);
        return match ? match[0] : undefined;
    }

    /**
     * Compare two dotted-numeric version strings.
     * Returns a positive number if `a` > `b`, negative if `a` < `b`, and 0 if equal.
     */
    private compareVersions(a: string, b: string): number {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        const length = Math.max(partsA.length, partsB.length);

        for (let i = 0; i < length; i++) {
            const numA = partsA[i] ?? 0;
            const numB = partsB[i] ?? 0;
            if (numA !== numB) {
                return numA - numB;
            }
        }

        return 0;
    }

    private async installSingleApp(
        device: Device,
        app: AppDefinition,
        currentIndex: number,
        totalApps: number,
        progressCallback: InstallProgressCallback,
        sudoPassword?: string
    ): Promise<{ success: boolean; failureReason?: string }> {
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
            if ((await this.verifyAppInstallation(device, app)).isInstalled) {
                return this.reportAlreadyInstalled(app, progress, progressCallback);
            }

            // App is not installed, proceed with installation
            logger.info(`${app.name} not found, proceeding with installation`);

            const preCheckFailure = await this.enforcePreInstallChecks(device, app, progress, progressCallback);
            if (preCheckFailure) {
                return preCheckFailure;
            }

            progressCallback({
                type: 'progress',
                progress: progress,
                currentApp: app.name,
                status: `Installing ${app.name}...`
            });

            const result = await this.runInstallCommand(device, app, sudoPassword);
            return await this.finalizeInstallResult(device, app, result, progressCallback);

        } catch (error) {
            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status: 'Failed'
            });
            logger.error(`Installation failed for ${app.name}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return { success: false, failureReason: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * Report that an app is already installed and can be skipped.
     */
    private reportAlreadyInstalled(
        app: AppDefinition,
        progress: number,
        progressCallback: InstallProgressCallback
    ): { success: true } {
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
        return { success: true };
    }

    /**
     * Run any pre-install validation checks defined for an app, surfacing warnings
     * via the progress callback. Returns a failure result if a blocking check failed,
     * or undefined if installation can proceed.
     */
    private async enforcePreInstallChecks(
        device: Device,
        app: AppDefinition,
        progress: number,
        progressCallback: InstallProgressCallback
    ): Promise<{ success: false; failureReason: string } | undefined> {
        if (!app.preInstallChecks || app.preInstallChecks.length === 0) {
            return undefined;
        }

        progressCallback({
            type: 'progress',
            progress: progress,
            currentApp: app.name,
            status: `Checking prerequisites for ${app.name}...`
        });

        const checksResult = await this.runPreInstallChecks(device, app);

        for (const warning of checksResult.warnings) {
            logger.warn(`Pre-install check warning for ${app.name}: ${warning}`);
            progressCallback({
                type: 'progress',
                progress: progress,
                currentApp: app.name,
                status: warning
            });
        }

        if (checksResult.passed) {
            return undefined;
        }

        progressCallback({
            type: 'appStatus',
            appId: app.id,
            status: 'Failed'
        });
        logger.warn(`Pre-install checks failed for ${app.name}: ${checksResult.failMessage}`);
        progressCallback({
            type: 'progress',
            progress: progress,
            currentApp: app.name,
            status: checksResult.failMessage
        });
        return { success: false, failureReason: checksResult.failMessage! };
    }

    /**
     * Execute an app's install command over SSH, wrapping it in a sudo bash -c
     * invocation when the command requires sudo and a password is available.
     */
    private async runInstallCommand(
        device: Device,
        app: AppDefinition,
        sudoPassword?: string
    ): Promise<SSHCommandResult> {
        const installCommand = app.installCommand;
        const requiresSudo = installCommand.includes('sudo');

        if (requiresSudo && sudoPassword) {
            // For sudo commands, wrap in single sudo bash -c
            const commandWithoutSudo = installCommand.replaceAll(/sudo\s+/g, '');
            const sudoCommand = `sudo -S bash -c ${this.escapeShellArg(commandWithoutSudo)}`;

            return executeSSHCommand(
                device,
                sudoCommand,
                { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                { operationName: app.name, sudoPassword, retries: 3 }
            );
        }

        return executeSSHCommand(
            device,
            installCommand,
            { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
            { operationName: app.name, sudoPassword, retries: 3 }
        );
    }

    /**
     * Interpret the result of an install command, verifying the app actually got
     * installed and reporting the appropriate progress/status.
     */
    private async finalizeInstallResult(
        device: Device,
        app: AppDefinition,
        result: SSHCommandResult,
        progressCallback: InstallProgressCallback
    ): Promise<{ success: boolean; failureReason?: string }> {
        if (!result.success) {
            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status: 'Failed'
            });
            logger.warn(`Installation command failed for ${app.name}`, { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
            return { success: false, failureReason: result.error?.message || result.stderr || `Installation command failed for ${app.name}.` };
        }

        // Confirm installation
        const { isInstalled, detail } = await this.verifyAppInstallation(device, app);

        if (isInstalled) {
            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status: 'Completed'
            });
            logger.info(`Successfully installed ${app.name}`);
            return { success: true };
        }

        progressCallback({
            type: 'appStatus',
            appId: app.id,
            status: 'Failed'
        });
        logger.error(`Failed to verify installation of ${app.name}`, { detail });
        return { success: false, failureReason: `Installation command completed but ${app.name} could not be verified as installed.` };
    }

    /**
     * Verify that an application is installed. Also returns verify command failure
     * detail (stderr/error message) so callers can surface it for diagnosis.
     */
    public async verifyAppInstallation(device: Device, app: AppDefinition): Promise<{ isInstalled: boolean; detail?: string }> {
        logger.debug(`Verifying installation of ${app.name}`);

        try {
            // We should never need sudo for verification commands
            const result = await executeSSHCommand(
                device,
                app.verifyCommand,
                { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                { operationName: app.name, timeoutSeconds: 7, retries: 3 }
            );
            if (!result.success) {
                logger.error('App verification failed', { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
            }
            return { isInstalled: result.success, detail: result.error?.message || result.stderr?.trim() || undefined };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Verification exception for ${app.name}`, { error: message });
            return { isInstalled: false, detail: message };
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
        const escapedSingleQuote = String.raw`'\''`;
        return `'${arg.replaceAll("'", escapedSingleQuote)}'`;
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

            const sudoValidationResult = await this.validateUninstallSudoRequirements(
                device,
                sortedApps,
                appsToUninstall,
                password
            );
            if (sudoValidationResult) {
                return sudoValidationResult;
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
                const condaResult = await this.removeCondaEnvironmentForUninstall(device, sortedApps, password, progressCallback);
                successfullyUninstalled.push(...condaResult.successfullyUninstalled);
                failedUninstalls.push(...condaResult.failedUninstalls);
            }

            // Uninstall each app sequentially
            const sequentialResult = await this.uninstallAppsSequentially(
                device,
                sortedApps,
                hasZgxCondaEnvironment,
                progressCallback,
                password
            );
            successfullyUninstalled.push(...sequentialResult.successfullyUninstalled);
            failedUninstalls.push(...sequentialResult.failedUninstalls);

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
     * Validate sudo password requirements for an uninstallation run.
     * Returns a failure result if validation fails, or null when it's safe to proceed.
     */
    private async validateUninstallSudoRequirements(
        device: Device,
        sortedApps: AppDefinition[],
        appsToUninstall: string[],
        password?: string
    ): Promise<UninstallationResult | null> {
        const requiresSudo = sortedApps.some(app => app.uninstallCommand?.includes('sudo'));

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

        return null;
    }

    /**
     * Remove the shared ZGX Python (Conda) environment and mark its dependent apps accordingly.
     */
    private async removeCondaEnvironmentForUninstall(
        device: Device,
        sortedApps: AppDefinition[],
        password: string | undefined,
        progressCallback?: UninstallProgressCallback
    ): Promise<{ successfullyUninstalled: string[]; failedUninstalls: string[] }> {
        const successfullyUninstalled: string[] = [];
        const failedUninstalls: string[] = [];

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

        const pythonToolApps = sortedApps.filter(app => app.dependencies?.includes(this.zgxPythonEnvId));

        if (condaEnvResult.success) {
            successfullyUninstalled.push(this.zgxPythonEnvId);
            logger.info('Successfully removed ZGX Python Environment');
            // Mark all Python Tools as successfully uninstalled
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

        return { successfullyUninstalled, failedUninstalls };
    }

    /**
     * Uninstall the given apps one at a time, skipping those already handled via the Conda environment removal.
     */
    private async uninstallAppsSequentially(
        device: Device,
        sortedApps: AppDefinition[],
        hasZgxCondaEnvironment: boolean,
        progressCallback: UninstallProgressCallback | undefined,
        password: string | undefined
    ): Promise<{ successfullyUninstalled: string[]; failedUninstalls: string[] }> {
        const successfullyUninstalled: string[] = [];
        const failedUninstalls: string[] = [];

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

        return { successfullyUninstalled, failedUninstalls };
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
        }
        this.reportUninstallStatus(app, 'Uninstalling', progressCallback);

        if (!app.uninstallCommand) {
            logger.debug(`${app.name} has no uninstall command, skipping`);
            return true;
        }

        try {
            const result = await this.runUninstallCommand(device, app, sudoPassword);

            if (result.success) {
                this.reportUninstallStatus(app, 'Completed', progressCallback);
                logger.info(`Successfully uninstalled ${app.name}`);
                return true;
            }

            this.reportUninstallStatus(app, 'Failed', progressCallback);
            logger.warn(`Failed to uninstall ${app.name}`, { device: device.name, error: result.error?.message, stderr: result.stderr, stdout: result.stdout });
            return false;

        } catch (error) {
            this.reportUninstallStatus(app, 'Failed', progressCallback);
            logger.error(`Uninstallation failed for ${app.name}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Execute the uninstall command for a single app, wrapping it in sudo if required.
     */
    private async runUninstallCommand(
        device: Device,
        app: AppDefinition,
        sudoPassword?: string
    ): Promise<SSHCommandResult> {
        const uninstallCommand = app.uninstallCommand as string;
        const requiresSudo = uninstallCommand.includes('sudo');

        if (requiresSudo && sudoPassword) {
            // For sudo commands, wrap in single sudo -S command
            const commandWithoutSudo = uninstallCommand.replaceAll(/sudo\s+/g, '');
            const sudoCommand = `sudo -S bash -c ${this.escapeShellArg(commandWithoutSudo)}`;

            return executeSSHCommand(
                device,
                sudoCommand,
                { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
                { operationName: app.name, sudoPassword, retries: 3 }
            );
        }

        return executeSSHCommand(
            device,
            uninstallCommand,
            { timeout: 30000, readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3 },
            { operationName: app.name, sudoPassword, retries: 3 }
        );
    }

    /**
     * Report an app uninstall status update via the progress callback, if provided.
     */
    private reportUninstallStatus(
        app: AppDefinition,
        status: 'Uninstalling' | 'Completed' | 'Failed',
        progressCallback?: UninstallProgressCallback
    ): void {
        if (progressCallback) {
            progressCallback({
                type: 'appStatus',
                appId: app.id,
                status
            });
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
        // Any app that doesn't belong to the above categories (e.g. Model Serving apps like ZRT)
        // still needs to be uninstalled. Fold it in with the system stack apps so dependency
        // ordering (e.g. an app uninstalled before a dependency it needed only at install time)
        // is still respected via reverseDependencySort below.
        const otherApps = apps.filter(app =>
            app.category !== 'python-tools' &&
            app.id !== 'miniforge' &&
            app.category !== 'system-stack'
        );

        // Build result: Python Tools -> Miniforge -> System Stack + other apps (reverse dependency order)
        const result: AppDefinition[] = [];

        // Add Python Tools first (they depend on miniforge)
        result.push(...pythonTools);

        // Add Miniforge
        if (miniforge) {
            result.push(miniforge);
        }

        // Add System Stack apps (plus any other-category apps like ZRT) in reverse dependency order
        // Apps with dependencies should be removed before their dependencies
        const sortedSystemStack = this.reverseDependencySort([...otherApps, ...systemStack]);
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
