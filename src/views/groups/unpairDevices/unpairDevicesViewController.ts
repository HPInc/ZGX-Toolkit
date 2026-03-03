/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Message, PasswordSubmittedMessage } from '../../../types/messages';
import { ConnectXGroupService } from '../../../services';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';

/**
 * Unpair Devices View - Confirmation dialog for unpairing a ConnectX Group.
 * Shows the device names in the group and asks for confirmation before
 * removing the group and unconfiguring ConnectX NICs on all devices.
 * Requires a groupId parameter to identify which group to unpair.
 */
export class UnpairDevicesViewController extends BaseViewController {
    public static viewId(): string {
        return 'groups/unpairDevices';
    }

    private readonly groupService: ConnectXGroupService;
    private groupId: string | undefined;
    private deviceNames: string[] = [];

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        connectxGroupService: ConnectXGroupService;
    }) {
        super(deps.logger, deps.telemetry);

        this.groupService = deps.connectxGroupService;

        this.template = this.loadTemplate('./unpairDevices.html', __dirname);
        this.styles = this.loadTemplate('./unpairDevices.css', __dirname);
        this.clientScript = this.loadTemplate('./unpairDevices.js', __dirname);

        // Enable error overlay and password input overlay support
        this.enableErrorOverlay();
        this.enablePasswordInputOverlay();
    }

    async render(params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering unpair devices view', params);

        // Store the groupId from params for later use
        this.groupId = params?.groupId;

        const devices = await this.loadGroupDevices();
        this.deviceNames = devices.map(d => d.name);

        const data = {
            devices: devices.length > 0 ? devices : null
        };

        const html = this.renderTemplate(this.template, data);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'groups.unpairDevices',
            },
            measurements: {
                deviceCount: devices.length
            }
        });

        return this.wrapHtml(html + this.getErrorOverlayHtml() + this.getPasswordInputOverlayHtml(), nonce);
    }

    /**
     * Load device information for the current group.
     * Returns an empty array if no groupId is set or if loading fails.
     */
    private async loadGroupDevices(): Promise<Array<{ name: string }>> {
        if (!this.groupId) {
            this.logger.warn('No groupId provided to unpair devices view');
            return [];
        }

        try {
            const groupInfo = await this.groupService.getGroupInfo(this.groupId);
            if (!groupInfo) {
                return [];
            }

            return groupInfo.devices.map(device => ({ name: device.name }));
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to load group devices', { groupId: this.groupId, error: errorMsg });
            return [];
        }
    }

    async handleMessage(message: Message): Promise<void> {
        // Handle error overlay close message - re-enable buttons after overlay dismissed
        if (message.type === 'close-error-overlay') {
            this.logger.info('Error overlay closed on unpair devices view');
            this.sendMessageToWebview({ type: 'unpair-error' });
            return;
        }

        // Handle password input submission - performs the actual unpair
        if (message.type === 'password-submitted') {
            await this.handlePasswordSubmitted(message);
            return;
        }

        // Handle password input cancellation
        if (message.type === 'password-input-cancelled') {
            this.logger.info('Password input cancelled');
            this.sendMessageToWebview({ type: 'unpair-error' });
            return;
        }

        await super.handleMessage(message);

        switch (message.type) {
            case 'confirm-unpair':
                await this.handleConfirmUnpair();
                break;
            case 'cancel':
                this.logger.debug('Unpair devices cancelled, navigating to device manager');
                await this.navigateTo(DeviceManagerViewController.viewId());
                break;
            default:
                this.logger.warn('Unknown message type', { type: (message as any).type });
        }
    }

    /**
     * Handle the confirm unpair action by prompting for sudo password.
     */
    private async handleConfirmUnpair(): Promise<void> {
        this.logger.debug('Confirm unpair requested, prompting for sudo password', { groupId: this.groupId });

        if (!this.groupId) {
            this.logger.error('Cannot unpair: no groupId available');
            this.showErrorOverlay(
                'Cannot Unpair Devices',
                'No group information is available. Please go back and try again.',
                'Missing groupId',
                'Close'
            );
            return;
        }

        // Prompt for sudo password before unpairing
        this.sendMessageToWebview({
            type: 'show-password-input',
            deviceIds: [],
            deviceNames: this.deviceNames
        });
    }

    /**
     * Handle password submission - removes group and unconfigures ConnectX NICs.
     */
    private async handlePasswordSubmitted(message: PasswordSubmittedMessage): Promise<void> {
        this.logger.debug('Password submitted, removing group and unconfiguring ConnectX NICs', { groupId: this.groupId });

        if (!this.groupId) {
            this.logger.error('Cannot unpair: no groupId available');
            this.showErrorOverlay(
                'Cannot Unpair Devices',
                'No group information is available. Please go back and try again.',
                'Missing groupId'
            );
            return;
        }

        try {
            const result = await this.groupService.removeGroupAndUnconfigureNICs(this.groupId, message.password);

            if (!result.success) {
                const errorMessage = result.error || 'Failed to unpair devices';

                this.logger.error('Failed to unpair devices', {
                    error: errorMessage,
                    groupId: this.groupId
                });

                this.telemetry.trackError({
                    eventType: TelemetryEventType.Error,
                    error: new Error(errorMessage),
                    context: 'groups.unpairDevices.removeAndUnconfigure'
                });

                this.showErrorOverlay(
                    'Failed to Unpair Devices',
                    'Device unpairing was unsuccessful due to an unexpected failure.\n*Please verify your sudo password and network configuration, then try again.*',
                    errorMessage,
                    'Retry'
                );
                return;
            }

            this.logger.info('Devices unpaired successfully', { groupId: this.groupId });

            // Navigate to device manager and show success notification
            await this.navigateTo(DeviceManagerViewController.viewId());

            const notificationMessage = result.nonFatalError
                ? `Devices have been unpaired. However, there were issues unconfiguring ConnectX NICs on one or more devices.`
                : `Devices have been unpaired successfully.`;

            await vscode.window.showInformationMessage(notificationMessage, { title: 'Dismiss' });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Unexpected error during device unpairing', {
                error: errorMessage,
                groupId: this.groupId
            });

            this.telemetry.trackError({
                eventType: TelemetryEventType.Error,
                error: error instanceof Error ? error : new Error(errorMessage),
                context: 'groups.unpairDevices'
            });

            this.showErrorOverlay(
                'Unexpected Error',
                'An unexpected error occurred while unpairing devices.\n*Please try again or contact support if the problem persists.*',
                errorMessage,
                'Retry'
            );
        }
    }
}

