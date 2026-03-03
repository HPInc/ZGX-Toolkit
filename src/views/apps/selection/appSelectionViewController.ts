/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { APP_CATEGORIES, AppDefinition, getAllApps, getAppById } from '../../../constants/apps';
import { DeviceService, deviceHealthCheckService } from '../../../services';
import { AppInstallationService } from '../../../services/appInstallationService';
import { AppProgressViewController } from '../progress/appProgressViewController';
import { InferenceInstructionsViewController } from '../../instructions/inference/inferenceInstructionsViewController';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';

/**
 * Application selection view - allows users to select apps to install on a device
 */
export class AppSelectionViewController extends BaseViewController {
    private readonly deviceService: DeviceService;
    private readonly appInstallationService: AppInstallationService;
    private cachedHealthCheckResult?: { isHealthy: boolean; error?: string; deviceId: string };

    public static viewId(): string {
        return 'apps/selection';
    }

    constructor(deps: {
        logger: Logger,
        telemetry: ITelemetryService,
        deviceService: DeviceService,
        appInstallationService: AppInstallationService
    }) {
        super(deps.logger, deps.telemetry);
        this.deviceService = deps.deviceService;
        this.appInstallationService = deps.appInstallationService;
        this.template = this.loadTemplate('./appSelection.html', __dirname);
        this.styles = this.loadTemplate('./appSelection.css', __dirname);
        this.clientScript = this.loadTemplate('./appSelection.js', __dirname);
        
        // Enable error overlay support
        this.enableErrorOverlay();
    }

    async render(params?: {
        device: Device;
    }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering app selection view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to app selection view');
            throw new Error('device required for app selection view');
        }

        const device = params.device;

        // Clear cached health check result on each render to ensure fresh status
        this.cachedHealthCheckResult = undefined;

        // Get all app definitions as a flat array
        const allApps = APP_CATEGORIES.flatMap(cat => cat.apps);

        // Calculate which apps are auto-dependencies
        const autoDependencies = this.calculateAutoDependencies([], [], allApps);

        // Transform categories for rendering
        const categories = APP_CATEGORIES.map(category => ({
            name: category.name,
            description: category.description,
            apps: category.apps.map((app: any) => ({
                id: app.id,
                icon: app.icon,
                name: app.name,
                description: app.description,
                features: app.features,
                installed: false,
                isBaseSystemInstalled: false
            }))
        }));

        const html = this.renderTemplate(this.template, {
            deviceName: device.name,
            categories
        });

        // Create initialization script that calls window.initAppSelection
        const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
        const initScript = `<script${nonceAttr}>
            window.initAppSelection({
                selectedApps: [],
                installedApps: ${JSON.stringify([])},
                deviceId: ${JSON.stringify(device.id)},
                appDefinitions: ${JSON.stringify(allApps)},
                autoDependencies: ${JSON.stringify(autoDependencies)}
            });
        </script>`;

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'apps.selection',
            },
        });

        // Include error overlay template BEFORE scripts so it's in DOM when scripts execute
        return this.wrapHtml(html + this.getErrorOverlayHtml(), nonce) + initScript;
    }

    async handleMessage(message: Message): Promise<void> {
        // Handle error overlay close message
        if (message.type === 'close-error-overlay') {
            this.logger.info('Error overlay closed');
            return;
        }

        await super.handleMessage(message);

        this.logger.trace('App selection view handling message', { type: message.type });

        switch (message.type) {
            case 'install-apps':
                await this.handleInstallApps(message);
                break;

            case 'uninstall-apps':
                await this.handleUninstallApps(message);
                break;

            case 'continue-to-inference':
                await this.handleContinueToInference(message);
                break;
            
            case 'check-ollama':
                await this.handleCheckOllama(message);
                break;

            case 'uninstall-all':
                await this.handleUninstallAll(message);
                break;

            case 'cancel':
                this.logger.debug('Cancel request from app selection');
                await this.navigateTo(DeviceManagerViewController.viewId());
                break;

            case 'verify-installations':
                await this.handleVerifyInstallations(message);
                break;

            default:
                this.logger.debug('Unhandled message type in app selection', { type: message.type });
                break;
        }
    }

    private async handleInstallApps(message: Message): Promise<void> {
        if (message.type !== 'install-apps') return;
        await this.handleAppOperation(message.deviceId, message.selectedApps, 'install', 'Install');
    }

    private async handleUninstallApps(message: Message): Promise<void> {
        if (message.type !== 'uninstall-apps') return;
        await this.handleAppOperation(message.deviceId, message.selectedApps, 'uninstall', 'Uninstall');
    }

    private async handleAppOperation(
        deviceId: string, 
        selectedApps: string[], 
        operation: 'install' | 'uninstall',
        operationLabel: string
    ): Promise<void> {
        this.logger.debug(`${operationLabel} apps requested`, { 
            deviceId,
            selectedApps
        });
        const device = await this.deviceService.getDevice(deviceId);
        if (!device) {
            this.logger.error(`device not found for app ${operation}`, { deviceId });
            return;
        }
        await this.navigateTo(AppProgressViewController.viewId(), { 
            device: device,
            operation,
            selectedApps
        });
    }

    private async handleContinueToInference(message: Message): Promise<void> {
        if (message.type !== 'continue-to-inference') return;
        
        this.logger.debug('Continue to inference requested', { 
            deviceId: message.deviceId
        });
        const device = await this.deviceService.getDevice(message.deviceId);
        if (!device) {
            this.logger.error('device not found for continue to inference', { deviceId: message.deviceId });
            return;
        }
        await this.navigateTo(InferenceInstructionsViewController.viewId(), { 
            device: device
        });
    }

    private async handleCheckOllama(message: Message): Promise<void> {
        if (message.type !== 'check-ollama') return;
        
        this.logger.debug('Checking ollama installation status', {
            deviceId: message.deviceId
        });
        
        const device = await this.deviceService.getDevice(message.deviceId);
        if (!device) {
            this.logger.error('Device not found for ollama check', { 
                deviceId: message.deviceId
            });
            return;
        }

        // Use cached device health check result if available for this device, otherwise perform new check
        let healthCheckResult;
        if (this.cachedHealthCheckResult && this.cachedHealthCheckResult.deviceId === device.id) {
            this.logger.debug('Using cached health check result for ollama check');
            healthCheckResult = this.cachedHealthCheckResult;
        } else {
            this.logger.debug('Performing health check for ollama check');
            healthCheckResult = await deviceHealthCheckService.checkDeviceHealth(device);
        }
        
        if (!healthCheckResult.isHealthy) {
            this.logger.warn('Skipping ollama check - device health check failed', {
                device: device.name,
                error: healthCheckResult.error
            });
            
            this.sendMessageToWebview({
                type: 'ollama-status',
                deviceId: message.deviceId,
                isInstalled: false
            });
            
            return;
        }

        const ollamaApp = getAppById('ollama');
        if (!ollamaApp) {
            this.logger.error('ollama app definition not found');
            return;
        }

        const isInstalled = await this.appInstallationService.verifyAppInstallation(
            device, 
            ollamaApp
        );

        this.logger.debug('ollama installation check complete', {
            deviceId: message.deviceId,
            isInstalled
        });

        this.sendMessageToWebview({
            type: 'ollama-status',
            deviceId: message.deviceId,
            isInstalled: isInstalled
        });
    }    
    
    private async handleUninstallAll(message: Message): Promise<void> {
        if (message.type !== 'uninstall-all') return;
        
        this.logger.debug('Uninstall all apps requested', { 
            deviceId: message.deviceId
        });
        const device = await this.deviceService.getDevice(message.deviceId);
        if (!device) {
            this.logger.error('device not found for uninstall all', { deviceId: message.deviceId });
            return;
        }
        await this.navigateTo(AppProgressViewController.viewId(), { 
            device: device,
            operation: "uninstall",
            selectedApps: "all"
        });
    }

    private async handleVerifyInstallations(message: Message): Promise<void> {
        if (message.type !== 'verify-installations') return;
        
        this.logger.debug('Verify installations requested', {
            deviceId: message.deviceId,
            appCount: message.appIds?.length
        });
        const device = await this.deviceService.getDevice(message.deviceId);
        if (!device) {
            this.logger.error('device not found for verify installations', { deviceId: message.deviceId });
            return;
        }
        await this.verifyInstallations(device, message.appIds);
    }

    /**
     * Verify installation status of multiple apps in parallel
     */
    private async verifyInstallations(device: Device, appIds: string[]): Promise<void> {
        this.logger.debug('Starting parallel verification', { appCount: appIds.length });
        
        // Perform health check before attempting verification
        const healthCheckResult = await deviceHealthCheckService.checkDeviceHealth(device);
        
        // Cache the health check result for reuse by other operations
        this.cachedHealthCheckResult = {
            ...healthCheckResult,
            deviceId: device.id
        };
        
        if (!healthCheckResult.isHealthy) {
            this.logger.warn('Aborting verification - device health check failed', {
                device: device.name,
                error: healthCheckResult.error
            });
            
            // Send cancellation message to webview to stop showing verification UI
            this.sendMessageToWebview({
                type: 'verification-cancelled'
            });
            
            // Show error overlay to user
            await this.performDeviceHealthCheck(device, healthCheckResult);
            
            return;
        }
        
        const allApps = getAllApps();
        
        // Process verifications in batches to avoid overwhelming the SSH server
        const BATCH_SIZE = 3; // Process 3 apps at a time
        const batches: string[][] = [];
        
        for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
            batches.push(appIds.slice(i, i + BATCH_SIZE));
        }
        
        this.logger.debug('Processing verifications in batches', { 
            totalApps: appIds.length,
            batchSize: BATCH_SIZE,
            batchCount: batches.length
        });
        
        // Process each batch sequentially
        for (const batch of batches) {
            const batchPromises = batch.map(async (appId) => {
                const app = allApps.find(a => a.id === appId);
                if (!app) {
                    this.logger.warn('App not found for verification', { appId });
                    return;
                }
                
                try {
                    const isInstalled = await this.appInstallationService.verifyAppInstallation(device, app);
                    
                    // Send result back to webview
                    this.sendMessageToWebview({
                        type: 'verification-result',
                        appId: appId,
                        isInstalled: isInstalled
                    });
                } catch (error) {
                    this.logger.error('Verification failed for app', {
                        appId,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    
                    // Send failure result
                    this.sendMessageToWebview({
                        type: 'verification-result',
                        appId: appId,
                        isInstalled: false
                    });
                }
            });
            
            // Wait for current batch to complete before starting next batch
            await Promise.all(batchPromises);
        }
        
        // Send completion message
        this.sendMessageToWebview({
            type: 'verification-complete'
        });
        
        this.logger.debug('Verification complete');
    }

    /**
     * Calculate which apps were auto-selected as dependencies
     * This needs to identify apps that are ONLY selected because other apps depend on them
     */
    private calculateAutoDependencies(
        selectedApps: string[],
        installedApps: string[],
        appDefinitions: AppDefinition[]
    ): string[] {
        const autoDeps: string[] = [];
        
        // Base system is always required if not installed
        if (!installedApps.includes('base-system') && selectedApps.includes('base-system')) {
            autoDeps.push('base-system');
        }

        // For each selected app, recursively collect all its dependencies
        const getAllDependencies = (appId: string, collected: Set<string> = new Set()): Set<string> => {
            const app = appDefinitions.find((a: AppDefinition) => a.id === appId);
            if (app && app.dependencies) {
                for (const depId of app.dependencies) {
                    if (!collected.has(depId) && !installedApps.includes(depId)) {
                        collected.add(depId);
                        // Recursively get dependencies of dependencies
                        getAllDependencies(depId, collected);
                    }
                }
            }
            return collected;
        };

        // Collect all dependencies required by selected apps
        const allRequiredDeps = new Set<string>();
        for (const appId of selectedApps) {
            const deps = getAllDependencies(appId);
            deps.forEach(dep => allRequiredDeps.add(dep));
        }

        // An app is an auto-dependency if:
        // 1. It's in the selected apps list
        // 2. It's a required dependency
        // 3. It's not base-system (already handled above) OR it is base-system and required
        for (const depId of allRequiredDeps) {
            if (selectedApps.includes(depId) && !autoDeps.includes(depId)) {
                autoDeps.push(depId);
            }
        }

        return autoDeps;
    }

    /**
     * Show error overlay for failed device health check.
     * @param device The device that failed the health check
     * @param healthCheckResult Optional pre-existing health check result to avoid duplicate checks
     */
    private async performDeviceHealthCheck(device: Device, healthCheckResult?: { isHealthy: boolean; error?: string }): Promise<void> {
        try {
            if (!healthCheckResult) {
                this.logger.debug('Performing device health check', { device: device.name });
                healthCheckResult = await deviceHealthCheckService.checkDeviceHealth(device);
            }

            if (healthCheckResult.isHealthy) {
                return;
            }
            
            
            this.sendMessageToWebview({
                type: 'show-error-overlay',
                errorTitle: 'Application installation status cannot be verified at this time',
                errorDetails: `Failed to establish an SSH connection to device **${device.name}**.\n*Please ensure the device is powered on, connected to the network, and that SSH key-based authentication is properly configured.*`,
                error: healthCheckResult.error || 'Connection could not be established to the device.',
                buttonText: 'Return to Device Manager',
                onClose: 'cancel'
            });
        } catch (error) {
            this.logger.error('Error during device health check', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });

            // Show error overlay for unexpected errors
            this.sendMessageToWebview({
                type: 'show-error-overlay',
                errorTitle: 'Device Health Check Failed',
                errorDetails: `An unexpected error occurred during health check for device **${device.name}**.`,
                error: `${error instanceof Error ? error.message : String(error)}`,
                buttonText: 'Return to Device Manager',
                onClose: 'cancel'
            });
        }
    }
}

