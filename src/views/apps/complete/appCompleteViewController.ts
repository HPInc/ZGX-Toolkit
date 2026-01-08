/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message, ConnectDeviceMessage } from '../../../types/messages';
import { getAppById, AppDefinition, getAllApps } from '../../../constants/apps';
import { AppInstallationService, ConnectionService, DeviceService } from '../../../services';
import { InferenceInstructionsViewController } from '../../instructions/inference/inferenceInstructionsViewController';
import { AppSelectionViewController } from '../selection/appSelectionViewController';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';
import { AppProgressViewController } from '../progress/appProgressViewController';

/**
 * Application installation complete view - shows results of installation
 */
export class AppCompleteViewController extends BaseViewController {
    private readonly connectionService: ConnectionService;
    private readonly deviceService: DeviceService;
    private readonly ollamaApp: AppDefinition;

    public static viewId(): string {
        return 'apps/complete';
    }

    constructor(deps: {
        logger: Logger,
        telemetry: ITelemetryService,
        deviceService: DeviceService,
        connectionService: ConnectionService
    }) {
        super(deps.logger, deps.telemetry);
        this.connectionService = deps.connectionService;
        this.deviceService = deps.deviceService;
        this.template = this.loadTemplate('./appComplete.html', __dirname);
        this.styles = this.loadTemplate('./appComplete.css', __dirname);
        this.clientScript = this.loadTemplate('./appComplete.js', __dirname);

        this.ollamaApp = getAppById('ollama')!;
    }

    async render(params?: {
        device: Device;
        installedApps?: string[];
        failedApps?: string[];
        errorReason?: string;
        operation?: 'install' | 'uninstall';
    }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering app complete view', {
            device: params?.device?.name,
            installedCount: params?.installedApps?.length || 0,
            failedCount: params?.failedApps?.length || 0,
            operation: params?.operation
        });

        if (!params?.device) {
            this.logger.error('No device provided to app complete view');
            throw new Error('device required for app complete view');
        }

        const device = params.device;

        this.deviceService.updateDevice(device.id, device);
        
        const installedApps = params.installedApps || [];
        const failedApps = params.failedApps || [];
        const errorReason = params.errorReason;
        const operation = params.operation || 'install';

        // Generate operation-specific text
        const operationLabel = operation === 'install' ? 'Install' : 'Uninstall';
        const operationPastTense = operation === 'install' ? 'Installation' : 'Uninstallation';
        const operationPastAction = operation === 'install' ? 'installed' : 'uninstalled';
        const operationPastActionCap = operation === 'install' ? 'Installed' : 'Uninstalled';

        // Get all app definitions
        const allApps = getAllApps();

        // Build successful and failed app lists
        const successfulApps = allApps
            .filter(app => installedApps.includes(app.id))
            .map(app => ({
                id: app.id,
                icon: app.icon,
                name: app.name
            }));

        const failedAppsList = allApps
            .filter(app => failedApps.includes(app.id))
            .map(app => ({
                id: app.id,
                icon: app.icon,
                name: app.name
            }));

        const hasAnyInstalls = successfulApps.length > 0;
        const hasFailures = failedAppsList.length > 0 || !!errorReason;
        const hasOllamaJustBeenInstalled = params.installedApps?.includes(this.ollamaApp.id) && operation === 'install';
        const isPasswordError = errorReason === 'password';

        const html = this.renderTemplate(this.template, {
            deviceName: device.name,
            deviceId: device.id,
            operation,
            operationLabel,
            operationPastTense,
            operationPastAction,
            operationPastActionCap,
            successfulApps,
            failedApps: failedAppsList,
            failedAppIds: failedApps.join(','),
            hasAnyInstalls,
            hasFailures,
            hasOllamaJustBeenInstalled,
            isPasswordError,
            completionIcon: hasFailures ? '⚠️' : '🎉',
            title: isPasswordError ? `${operationPastTense} Failed` : `Application ${operationLabel} Complete!`,
            subtitle: isPasswordError
                ? `Unable to ${operation} applications on ${device.name}`
                : `${operationPastTense} process finished for ${device.name}`
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'apps.complete',
            },
            measurements: {
                successCount: successfulApps.length,
                failureCount: failedAppsList.length
            }
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('App complete view handling message', { type: message.type });

        switch (message.type) {
            case 'connect-device': {
                // Connect to device - delegate to connection service via navigation
                this.logger.debug('Connect device request from apps/complete view', { deviceId: message.id });
                let device = await this.deviceService.getDevice(message.id);
                if (!device) {
                    this.logger.error('device not found for connection', { deviceId: message.id });
                    return;
                }
                this.connectionService.connectViaRemoteSSH(device, true);
                break;
            }

            case 'continue-to-inference': {
                // Navigate to inference instructions
                this.logger.debug('Continuing to inference instructions', { deviceId: message.deviceId });
                const device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for inference instructions', { deviceId: message.deviceId });
                }
                await this.navigateTo(InferenceInstructionsViewController.viewId(), { device: device });
                break;
            }

            case 'retry-failed': {
                // Navigate back to app selection view
                this.logger.debug('Retrying app selection', { deviceId: message.deviceId });
                const device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('device not found for inference instructions', { deviceId: message.deviceId });
                }
                await this.navigateTo(AppProgressViewController.viewId(), { device: device, operation: message.operation, selectedApps: message.failedApps });
                break;
            }

            case 'cancel': {
                // Close or go back
                this.logger.debug('Cancel/close request from complete view');
                await this.navigateTo(DeviceManagerViewController.viewId());
                break;
            }

            default: {
                // Handle unknown messages by logging
                this.logger.debug('Unhandled message in complete view', { type: message.type });
                break;
            }
        }
    }
}
