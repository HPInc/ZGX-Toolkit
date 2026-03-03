/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Message, PasswordSubmittedMessage } from '../../../types/messages';
import { Device } from '../../../types/devices';
import { DeviceService, ConnectXGroupService, DeviceHealthCheckService } from '../../../services';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';

/**
 * Pair Devices View - Dialog for selecting and pairing two devices into a ConnectX Group.
 * Shows available devices (not already in groups) with checkboxes for selection.
 * Enforces exactly 2 device selection before allowing pairing.
 */
export class PairDevicesViewController extends BaseViewController {
    private unsubscribes: Array<() => void> = [];
    private pairingInProgress: boolean = false;

    public static viewId(): string {
        return 'groups/pairDevices';
    }

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        deviceService: DeviceService;
        connectxGroupService: ConnectXGroupService;
        deviceHealthCheckService: DeviceHealthCheckService;
    }) {
        super(deps.logger, deps.telemetry);

        this.deviceService = deps.deviceService;
        this.groupService = deps.connectxGroupService;
        this.healthCheckService = deps.deviceHealthCheckService;

        this.template = this.loadTemplate('./pairDevices.html', __dirname);
        this.styles = this.loadTemplate('./pairDevices.css', __dirname);
        this.clientScript = this.loadTemplate('./pairDevices.js', __dirname);

        // Enable error overlay support
        this.enableErrorOverlay();
        
        // Enable password input overlay support
        this.enablePasswordInputOverlay();

        // Subscribe to device store updates to refresh available devices
        this.unsubscribes.push(
            this.deviceService.subscribe(() => {
                if (this.pairingInProgress) {
                    this.logger.trace('Device store updated during pairing, skipping refresh');
                    return;
                }
                this.logger.trace('Device store updated, refreshing pair devices view');
                this.refresh().catch(error => {
                    this.logger.error('Failed to refresh pair devices view after store update', { error });
                });
            })
        );

        // Subscribe to group store updates for paired/unpaired states
        this.unsubscribes.push(
            this.groupService.subscribe((_groups) => {
                if (this.pairingInProgress) {
                    this.logger.trace('Group store updated during pairing, skipping refresh');
                    return;
                }
                this.logger.trace('Group store updated, refreshing pair devices view');
                this.refresh().catch(error => {
                    this.logger.error('Failed to refresh pair devices view after group store update', { error });
                });
            })
        );
    }

    private deviceService: DeviceService;
    private groupService: ConnectXGroupService;
    private healthCheckService: DeviceHealthCheckService;

    async render(params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering pair devices view', params);

        // Get all devices, excluding those that have not completed initial setup
        const allDevices = (await this.deviceService.getAllDevices())
            .filter(device => device.isSetup);

        // Get all groups to identify devices already in groups
        const allGroups = await this.groupService.getAllGroups();
        const devicesInGroups = new Set<string>();
        for (const group of allGroups) {
            for (const deviceId of group.deviceIds) {
                devicesInGroups.add(deviceId);
            }
        }

        // Map devices with isPaired flag
        const devicesWithStatus = allDevices
            .map(device => ({
                ...device,
                isPaired: devicesInGroups.has(device.id)
            }))
            .sort((a, b) => {
                // Unpaired devices first, then paired devices
                if (a.isPaired === b.isPaired) return 0;
                return a.isPaired ? 1 : -1;
            });

        const availableCount = devicesWithStatus.filter(d => !d.isPaired).length;

        const data = {
            devices: allDevices.length > 0 ? devicesWithStatus : null,
            noDevices: allDevices.length === 0,
            deviceCount: allDevices.length,
            availableCount: availableCount,
            zgxNanoDiagramUri: params?.zgxNanoDiagramUri || ''
        };

        // Render the main template with device data
        const html = this.renderTemplate(this.template, data);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'groups.pairDevices',
            },
            measurements: {
                availableDeviceCount: availableCount,
                totalDeviceCount: allDevices.length
            }
        });

        // Include error overlay and password input overlay templates
        return this.wrapHtml(html + this.getErrorOverlayHtml() + this.getPasswordInputOverlayHtml(), nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        // Handle error overlay close message
        if (message.type === 'close-error-overlay') {
            this.logger.info('Error overlay closed on pair devices view');
            this.sendMessageToWebview({ type: 'reset-pairing-state' });
            return;
        }

        // Handle password input submission
        if (message.type === 'password-submitted') {
            await this.handlePasswordSubmitted(message);
            return;
        }

        // Handle password input cancellation
        if (message.type === 'password-input-cancelled') {
            this.logger.info('Password input cancelled');
            this.sendMessageToWebview({ type: 'pairing-cancelled' });
            return;
        }

        await super.handleMessage(message);

        switch (message.type) {
            case 'pair-devices':
                await this.pairDevices(message.deviceIds);
                break;
            case 'cancel':
                this.logger.debug('Pair devices cancelled, navigating to device manager');
                await this.navigateTo(DeviceManagerViewController.viewId());
                break;
            default:
                this.logger.warn('Unknown message type', { type: (message as any).type });
        }
    }

    /**
     * Pair the selected devices into a ConnectX Group
     * Performs health checks and prompts for password before creating group
     */
    private async pairDevices(deviceIds: string[]): Promise<void> {
        this.logger.debug('Pairing devices', { deviceIds });

        try {
            // Validate we have exactly 2 devices
            if (!deviceIds || deviceIds.length !== 2) {
                this.sendMessageToWebview({
                    type: 'pair-error',
                    error: 'Please select exactly 2 devices to pair'
                });
                return;
            }

            // Fetch device details for the selected device IDs
            this.logger.debug('Fetching device details for pairing', { deviceIds });
            const devices = await Promise.all(
                deviceIds.map(id => this.deviceService.getDevice(id))
            );

            // Filter out undefined devices
            const validDevices = devices.filter((d): d is Device => d !== undefined);

            // Checks for race condition where device(s) may have been removed after selection
            if (validDevices.length !== 2) {
                const errorMsg = 'One or more selected devices could not be found';
                this.logger.error(errorMsg, { deviceIds });
                
                this.telemetry.trackError({
                    eventType: TelemetryEventType.Error,
                    error: new Error(errorMsg),
                    context: 'groups.pairDevices.deviceNotFound'
                });

                this.showPairingErrorOverlay(
                    'Device Not Available',
                    `One or more selected devices is no longer available. The device may have been removed.\n*Please refresh the view and try again.*`,
                    errorMsg,
                    'Return to Device Manager',
                    'cancel',
                    null
                );
                return;
            }

            // Perform health checks on both devices
            this.logger.debug('Performing device health checks before pairing', { deviceIds });
            const healthChecks = await Promise.all(
                validDevices.map(device => this.healthCheckService.checkDeviceHealth(device))
            );

            // Check if any device failed the health check
            const failedDevices = healthChecks.filter(result => !result.isHealthy);
            if (failedDevices.length > 0) {
                const deviceNames = failedDevices.map(result => result.device).join(', ');
                // Format error details as plain text with each device on a new line
                const errorDetails = failedDevices.map(result => 
                    `${result.device}: ${result.error || 'Connection failed'}`.trim()
                ).join('\n');

                this.logger.error('Device connectivity test failed during pairing', {
                    failedDevices: failedDevices.map(r => r.device),
                    deviceIds
                });

                this.telemetry.trackError({
                    eventType: TelemetryEventType.Error,
                    error: new Error(`Device connectivity check failed: ${deviceNames}`),
                    context: 'groups.pairDevices.healthCheck'
                });

                this.showPairingErrorOverlay(
                    'Device pairing cannot be completed at this time',
                    `Unable to pair devices. Failed to establish SSH connection to device(s): **${deviceNames}**.\n*Please ensure the devices are powered on, connected to the network, and that SSH key-based authentication is properly configured.*`,
                    errorDetails,
                    'Retry'
                );
                return;
            }

            this.logger.debug('All devices passed connectivity tests', { deviceIds });

            // Prompt for sudo password before creating group and configuring NICs
            this.logger.debug('Prompting for sudo password before creating group and configuring ConnectX NICs');
            
            this.sendMessageToWebview({
                type: 'show-password-input',
                deviceIds: deviceIds,
                deviceNames: validDevices.map(d => d.name)
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Unexpected error during device pairing', { error: errorMessage, deviceIds });
            
            this.telemetry.trackError({
                eventType: TelemetryEventType.Error,
                error: error instanceof Error ? error : new Error(errorMessage),
                context: 'groups.pairDevices'
            });

            this.showPairingErrorOverlay(
                'Unexpected Error',
                `An unexpected error occurred while preparing to pair devices.\n*Please try again or contact support if the problem persists.*`,
                errorMessage,
                'Retry'
            );
        }
    }

    /**
     * Handle password submission - creates group and configures ConnectX NICs
     */
    private async handlePasswordSubmitted(message: PasswordSubmittedMessage): Promise<void> {
        this.logger.debug('Password submitted, creating group and configuring ConnectX NICs', { deviceIds: message.deviceIds });

        // Suppress store-triggered refreshes during pairing to prevent the view from
        // resetting before error overlays can be shown (e.g. on incorrect sudo password)
        this.pairingInProgress = true;

        try {
            // Create group and configure NICs
            const result = await this.groupService.createGroupAndConfigureNICs(
                { deviceIds: message.deviceIds },
                message.password
            );

            if (!result.success) {
                // Service has already rolled back the group if NIC configuration failed
                const errorMessage = result.error || 'Failed to create group and configure ConnectX NICs';
                
                this.logger.error('Failed to create group and configure ConnectX NICs', { 
                    error: errorMessage,
                    deviceIds: message.deviceIds
                });

                this.telemetry.trackError({
                    eventType: TelemetryEventType.Error,
                    error: new Error(errorMessage),
                    context: 'groups.pairDevices.createAndConfigure'
                });

                this.pairingInProgress = false;

                this.showPairingErrorOverlay(
                    'Failed to Pair Devices',
                    `Device pairing was unsuccessful due to an unexpected failure.\n*The devices were not paired. Please verify your sudo password and network configuration, then try again.*`,
                    errorMessage,
                    'Retry Pairing'
                );
                return;
            }

            this.logger.info('Group created and ConnectX NICs configured successfully', { 
                groupId: result.group?.id,
                deviceIds: message.deviceIds
            });

            // Show success notification
            await this.showPairingSuccessNotification(message.deviceNames[0], message.deviceNames[1]);

            this.pairingInProgress = false;

            this.sendMessageToWebview({
                type: 'pair-success',
                message: 'Devices paired and ConnectX NICs configured successfully',
                groupId: result.group?.id
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Unexpected error during group creation and configuration', { 
                error: errorMessage,
                deviceIds: message.deviceIds
            });

            this.telemetry.trackError({
                eventType: TelemetryEventType.Error,
                error: error instanceof Error ? error : new Error(errorMessage),
                context: 'groups.pairDevices.createAndConfigure'
            });

            this.pairingInProgress = false;

            this.showPairingErrorOverlay(
                'Failed to Pair Devices',
                `An unexpected error occurred during device pairing.\n*Please verify your network configuration and try again.*`,
                errorMessage,
                'Retry Pairing'
            );
        }
    }

    /**
     * Show error overlay with consistent pairing error format
     * @param errorTitle Title shown in overlay header
     * @param errorDetails User-friendly error details with guidance
     * @param technicalError Technical error message for debugging
     * @param buttonText Text for primary action button
     * @param onClose Optional message type to send when overlay closes (defaults to 'close-error-overlay')
     * @param secondaryButton Optional secondary button config (defaults to "Return to Device Manager")
     */
    private showPairingErrorOverlay(
        errorTitle: string,
        errorDetails: string,
        technicalError: string,
        buttonText: string,
        onClose?: string,
        secondaryButton?: { text: string; onClick: string } | null
    ): void {
        this.sendMessageToWebview({
            type: 'show-error-overlay',
            errorTitle,
            errorDetails,
            error: technicalError,
            buttonText,
            onClose: onClose || 'close-error-overlay',
            secondaryButton: secondaryButton === null ? undefined : (secondaryButton || {
                text: 'Return to Device Manager',
                onClick: 'cancel'
            })
        });
    }

    /**
     * Show the pairing success notification and handle navigation.
     */
    private async showPairingSuccessNotification(deviceName1: string, deviceName2: string): Promise<void> {
        // Navigate to device manager first
        await this.navigateTo(DeviceManagerViewController.viewId());

        // Show VS Code notification with action buttons
        const selection = await vscode.window.showInformationMessage(
            `Devices "${deviceName1}" and "${deviceName2}" are now paired and ready for use.`,
            { title: 'Dismiss' },
            { title: 'Pair More Devices' }
        );

        if (selection?.title === 'Pair More Devices') {
            await this.navigateTo(PairDevicesViewController.viewId());
        }
    }

    dispose(): void {
        for (const unsubscribe of this.unsubscribes) {
            unsubscribe();
        }
        this.unsubscribes = [];
        super.dispose();
    }
}
