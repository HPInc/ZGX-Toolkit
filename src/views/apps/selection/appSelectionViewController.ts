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
import { DeviceService } from '../../../services';
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

        return this.wrapHtml(html, nonce) + initScript;
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('App selection view handling message', { type: message.type });

        let device: Device | undefined;

        switch (message.type) {
            case 'install-apps':
                this.logger.debug('Install apps requested', { 
                    deviceId: message.deviceId,
                    selectedApps: message.selectedApps
                });
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for app install', { deviceId: message.deviceId });
                    return;
                }
                // Navigate to progress view
                await this.navigateTo(AppProgressViewController.viewId(), { 
                    device: device,
                    operation: "install",
                    selectedApps: message.selectedApps
                });
                break;

            case 'uninstall-apps':
                this.logger.debug('Uninstall apps requested', { 
                    deviceId: message.deviceId,
                    selectedApps: message.selectedApps
                });
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for app uninstall', { deviceId: message.deviceId });
                    return;
                }
                // Navigate to progress view
                await this.navigateTo(AppProgressViewController.viewId(), { 
                    device: device,
                    operation: "uninstall",
                    selectedApps: message.selectedApps
                });
                break;

            case 'continue-to-inference':
                this.logger.debug('Continue to inference requested', { 
                    deviceId: message.deviceId
                });
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for continue to inference', { deviceId: message.deviceId });
                    return;
                }
                // Navigate to inference instructions
                await this.navigateTo(InferenceInstructionsViewController.viewId(), { 
                    device: device
                });
                break;
            
            case 'check-ollama': {
                this.logger.debug('Checking ollama installation status', {
                    deviceId: message.deviceId
                });
                
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('Device not found for ollama check', { 
                        deviceId: message.deviceId 
                    });
                    return;
                }

                // Get ollama app definition
                const ollamaApp = getAppById('ollama');
                if (!ollamaApp) {
                    this.logger.error('ollama app definition not found');
                    return;
                }

                // Check if the app is installed
                const isInstalled = await this.appInstallationService.verifyAppInstallation(
                    device, 
                    ollamaApp
                );

                this.logger.debug('ollama installation check complete', {
                    deviceId: message.deviceId,
                    isInstalled
                });

                // Send response back to webview
                this.sendMessageToWebview({
                    type: 'ollama-status',
                    deviceId: message.deviceId,
                    isInstalled: isInstalled
                });
                break;
            }

            case 'uninstall-all':
                this.logger.debug('Uninstall all apps requested', { 
                    deviceId: message.deviceId
                });
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for uninstall all', { deviceId: message.deviceId });
                    return;
                }
                await this.navigateTo(AppProgressViewController.viewId(), { 
                    device: device,
                    operation: "uninstall",
                    selectedApps: "all"
                });
                // This will be handled by the provider/service level
                break;

            case 'cancel':
                this.logger.debug('Cancel request from app selection');

                await this.navigateTo(DeviceManagerViewController.viewId());
                break;

            case 'verify-installations':
                this.logger.debug('Verify installations requested', {
                    deviceId: message.deviceId,
                    appCount: message.appIds?.length
                });
                device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for verify installations', { deviceId: message.deviceId });
                    return;
                }

                await this.verifyInstallations(device, message.appIds);
                break;

            default:
                this.logger.debug('Unhandled message type in app selection', { type: message.type });
                break;
        }
    }

    /**
     * Verify installation status of multiple apps in parallel
     */
    private async verifyInstallations(device: Device, appIds: string[]): Promise<void> {
        this.logger.debug('Starting parallel verification', { appCount: appIds.length });
        
        const allApps = getAllApps();
        
        // Create verification promises for all apps
        const verificationPromises = appIds.map(async (appId) => {
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
        
        // Wait for all verifications to complete
        await Promise.all(verificationPromises);
        
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
}
