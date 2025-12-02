/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { APP_CATEGORIES, AppDefinition, getAllApps } from '../../../constants/apps';
import { AppInstallationService, PasswordService, DeviceService, InstallationErrorType } from '../../../services';
import { deviceStore } from '../../../store/deviceStore';
import { AppCompleteViewController } from '../complete/appCompleteViewController';
import { AppSelectionViewController } from '../selection/appSelectionViewController';

/**
 * Application installation progress view - displays real-time progress of app installation
 */
export class AppProgressViewController extends BaseViewController {
    private readonly appInstallationService: AppInstallationService;
    private readonly passwordService: PasswordService;
    private readonly deviceService: DeviceService;
    private currentDevice?: Device;
    private currentOperation?: "install" | "uninstall";
    private currentSelectedApps?: string[];
    private validatedPassword?: string;

    public static viewId(): string {
        return 'apps/progress';
    }

    constructor(deps: {
        logger: Logger,
        telemetry: ITelemetryService,
        appInstallationService: AppInstallationService,
        passwordService: PasswordService,
        deviceService: DeviceService
    }) {
        super(deps.logger, deps.telemetry);
        this.appInstallationService = deps.appInstallationService;
        this.passwordService = deps.passwordService;
        this.deviceService = deps.deviceService;
        this.template = this.loadTemplate('./appProgress.html', __dirname);
        this.styles = this.loadTemplate('./appProgress.css', __dirname);
        this.clientScript = this.loadTemplate('./appProgress.js', __dirname);
    }

    async render(params?: {
        device: Device;
        operation: "install" | "uninstall";
        selectedApps: string[] | "all";
    }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering app progress view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to app progress view');
            throw new Error('device required for app progress view');
        }

        const device = params.device;
        this.currentDevice = device;
        this.currentOperation = params.operation || 'install';
        this.validatedPassword = undefined; // Reset password on new render

        let appDetails: AppDefinition[];
        
        if (params.selectedApps === "all") {
            appDetails = getAllApps();
            this.currentSelectedApps = getAllApps().map(a => a.id);
        } else {
            appDetails = APP_CATEGORIES.flatMap(cat => cat.apps)
                .filter(app => params.selectedApps.includes(app.id));
            this.currentSelectedApps = params.selectedApps;
        }
        
        const operation = params.operation || 'install';
        
        // Sort apps in the same order they will be processed
        const sortedAppDetails = operation === 'install' 
            ? this.appInstallationService.sortAppsByDependencies(appDetails)
            : this.appInstallationService.sortAppsForUninstallation(appDetails);

        const operationLabel = operation === 'install' ? 'Install' : 'Uninstall';
        const operationVerb = operation === 'install' ? 'Installing' : 'Uninstalling';
        const operationVerbLower = operation === 'install' ? 'installing' : 'uninstalling';
        const operationPastTense = operation === 'install' ? 'installation' : 'uninstallation';
        const fullUninstall = operation === 'uninstall' && params.selectedApps === "all";

        const html = this.renderTemplate(this.template, {
            deviceName: device.name,
            deviceId: device.id,
            operation: operation,
            operationLabel: operationLabel,
            operationVerb: operationVerb,
            operationVerbLower: operationVerbLower,
            operationPastTense: operationPastTense,
            fullUninstall: fullUninstall,
            apps: sortedAppDetails.map(app => ({
                id: app.id,
                icon: app.icon,
                name: app.name
            }))
        });

        // Check if password is needed
        const requiresSudo = this.checkIfPasswordRequired(appDetails, operation);

        // Defer installation start - wait for password if needed
        setTimeout(async () => {
            if (requiresSudo) {
                // Show password prompt in the webview
                await this.sendMessageToWebview({
                    type: 'showPasswordPrompt'
                });
            } else {
                // No password needed, start immediately
                await this.startOperation();
            }
        }, 100);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'apps.progress',
            },
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Check if the operation requires a sudo password
     */
    private checkIfPasswordRequired(appDetails: AppDefinition[], operation: "install" | "uninstall"): boolean {
        if (operation === 'install') {
            return appDetails.some(app => app.installCommand.includes('sudo'));
        } else {
            return appDetails.some(app => 
                app.uninstallCommand && app.uninstallCommand.includes('sudo')
            );
        }
    }

    /**
     * Start the operation (install or uninstall) after password validation (if needed)
     */
    private async startOperation(): Promise<void> {
        if (!this.currentDevice || !this.currentOperation || !this.currentSelectedApps) {
            this.logger.error('Missing context for operation');
            return;
        }

        switch (this.currentOperation) {
            case "install": {
                await this.startInstallation(this.currentDevice, this.currentSelectedApps);
                break;
            }
            case "uninstall": {
                await this.startUninstallation(this.currentDevice, this.currentSelectedApps);
                break;
            }
        }
    }

    /**
     * Start the application installation process
     */
    private async startInstallation(device: Device, selectedApps: string[]): Promise<void> {
        this.logger.info('Starting application installation', {
            device: device.name,
            apps: selectedApps
        });

        try {
            // Use the validated password from class property
            const password = this.validatedPassword;

            // Start installation with progress callback
            const result = await this.appInstallationService.installApplications(
                device,
                selectedApps,
                (progress) => {
                    // Send progress updates to the webview
                    this.sendProgressUpdate(progress);
                },
                password
            );

            // Handle installation result
            if (result.success) {
                this.logger.info('Installation completed successfully', {
                    installed: result.installedApps.length
                });

                // Update device's app setup status
                device.appSetupComplete = true;

                // Update store
                await this.deviceService.updateDevice(device.id, device);

                // Navigate to completion view
                await this.navigateTo(AppCompleteViewController.viewId(), { 
                        device,
                        installedApps: result.installedApps,
                        failedApps: result.failedApps,
                        operation: 'install'
                     });
            } else {
                // Installation failed
                this.logger.error('Installation failed', {
                    message: result.message,
                    failedApps: result.failedApps
                });

                // Show completion with failed apps
                await this.navigateTo(AppCompleteViewController.viewId(), {
                    device,
                    installedApps: result.installedApps,
                    failedApps: result.failedApps,
                    operation: 'install'
                });
            }
        } catch (error) {
            this.logger.error('Installation error', {
                error: error instanceof Error ? error.message : String(error)
            });

            await this.sendProgressUpdate({
                type: 'error',
                message: error instanceof Error ? error.message : 'Installation failed'
            });
        }
    }

    /**
     * Start the application uninstallation process
     */
    private async startUninstallation(device: Device, selectedApps: string[]): Promise<void> {
        this.logger.info('Starting application uninstallation', {
            device: device.name,
            apps: selectedApps
        });

        try {
            // Use the validated password from class property
            const password = this.validatedPassword;

            // Start uninstallation with progress callback
            const result = await this.appInstallationService.uninstallApplications(
                device,
                selectedApps,
                (progress) => {
                    // Send progress updates to the webview
                    this.sendProgressUpdate(progress);
                },
                password
            );

            // Handle uninstallation result
            if (result.success) {
                this.logger.info('Uninstallation completed successfully', {
                    uninstalled: result.uninstalledApps.length
                });

                // Update device's app setup status if all apps were uninstalled
                if (result.uninstalledApps.length === selectedApps.length) {
                    device.appSetupComplete = false;
                }

                // Update store
                await this.deviceService.updateDevice(device.id, device);

                // Navigate to completion view
                await this.navigateTo(AppCompleteViewController.viewId(), {
                    device,
                    installedApps: result.uninstalledApps,
                    failedApps: result.failedApps,
                    operation: 'uninstall'
                });
            } else {
                // Uninstallation failed
                this.logger.error('Uninstallation failed', {
                    message: result.message,
                    failedApps: result.failedApps
                });

                // Show completion with failed apps
                await this.navigateTo(AppCompleteViewController.viewId(), {
                    device,
                    installedApps: result.uninstalledApps,
                    failedApps: result.failedApps,
                    operation: 'uninstall'
                });
            }
        } catch (error) {
            this.logger.error('Uninstallation error', {
                error: error instanceof Error ? error.message : String(error)
            });

            await this.sendProgressUpdate({
                type: 'error',
                message: error instanceof Error ? error.message : 'Uninstallation failed'
            });
        }
    }

    /**
     * Send a progress update to the webview
     */
    private async sendProgressUpdate(progress: any): Promise<void> {
        this.sendMessageToWebview(progress);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('App install view handling message', { type: message.type });

        switch (message.type) {
            case 'validatePassword':
                await this.handlePasswordValidation(message.password);
                break;

            case 'cancel':
                // Navigate back to app selection
                if (this.currentDevice) {
                    await this.navigateTo(AppSelectionViewController.viewId(), { device: this.currentDevice });
                }
                break;

            default:
                this.logger.debug('Unhandled message type in app install', { type: message.type });
                break;
        }
    }

    /**
     * Handle password validation from the webview
     */
    private async handlePasswordValidation(password: string): Promise<void> {
        if (!this.currentDevice) {
            this.logger.error('No device available for password validation');
            return;
        }

        this.logger.info('Validating password from webview');

        try {
            // Validate password using the appInstallationService
            const isValid = await this.appInstallationService.validatePassword(this.currentDevice, password);

            if (isValid) {
                this.logger.info('Password validated successfully');
                this.validatedPassword = password;

                // Notify webview of successful validation
                await this.sendMessageToWebview({
                    type: 'passwordValidationResult',
                    valid: true
                });

                // Start the operation now that password is validated
                await this.startOperation();
            } else {
                this.logger.warn('Password validation failed');
                
                // Notify webview of failed validation
                await this.sendMessageToWebview({
                    type: 'passwordValidationResult',
                    valid: false
                });
            }
        } catch (error) {
            this.logger.error('Error during password validation', {
                error: error instanceof Error ? error.message : String(error)
            });

            // Notify webview of error
            await this.sendMessageToWebview({
                type: 'passwordValidationResult',
                valid: false,
                error: error instanceof Error ? error.message : 'Validation error'
            });
        }
    }
}
