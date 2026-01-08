/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { ConnectionService } from '../../../services/connectionService';
import { SetupOptionsViewController } from '../options/setupOptionsViewController';
import { DnsRegistrationViewController } from '../dnsRegistration/dnsRegistrationViewController';

/**
 * Manual SSH setup view - guides users through manual SSH key setup with platform-specific commands
 */
export class ManualSetupViewController extends BaseViewController {
    private connectionService: ConnectionService;
    private currentDevice?: Device;

    public static viewId(): string {
        return 'setup/manual';
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            connectionService: ConnectionService;
        }
    ) {
        super(deps.logger, deps.telemetry);
        this.connectionService = deps.connectionService;
        this.template = this.loadTemplate('./manualSetup.html', __dirname);
        this.styles = this.loadTemplate('./manualSetup.css', __dirname);
        this.clientScript = this.loadTemplate('./manualSetup.js', __dirname);
    }

    async render(params?: { device: Device }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering manual setup view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to manual setup view');
            throw new Error('device required for manual setup view');
        }

        // Store device for message handling
        this.currentDevice = params.device;

        const device = params.device;
        const commands = this.connectionService.generateManualSetupCommands(device);

        const hasSshKey: boolean = this.connectionService.hasIDED25519Key();

        const html = this.renderTemplate(this.template, {
            deviceName: device.name,
            windowsKeyGen: commands.windows.keyGen,
            linuxKeyGen: commands.linux.keyGen,
            macKeyGen: commands.mac.keyGen,
            windowsCopy: commands.windows.copy,
            linuxCopy: commands.linux.copy,
            macCopy: commands.mac.copy,
            testCommand: commands.testCommand,
            hasSSHKey: hasSshKey
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'setup.manual',
            },
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('Manual setup view handling message', { type: message.type });

        if (!this.currentDevice) {
            this.logger.error('No device available for message handling');
            return;
        }

        switch (message.type) {
            case 'testConnection':
                await this.handleTestConnection(this.currentDevice);
                break;

            case 'manualComplete':
                await this.handleManualComplete(this.currentDevice);
                break;

            case 'back':
                // Navigate back to setup options
                await this.navigateTo(SetupOptionsViewController.viewId(), { device: this.currentDevice });
                break;

            default:
                this.logger.debug('Unhandled message type in manual setup', { type: message.type });
        }
    }

    /**
     * Handle test connection - verify SSH connectivity
     */
    private async handleTestConnection(device: Device): Promise<void> {
        this.logger.info('Testing SSH connection', { device: device.name });

        try {
            // Test SSH connectivity
            const testSuccessful = await this.connectionService.testSSHKeyConnectivity(device);

            if (testSuccessful) {
                this.logger.info('SSH connection test successful', { device: device.name });

                // Navigate to DNS registration view
                await this.navigateTo(DnsRegistrationViewController.viewId(), { 
                    device: device,
                    setupType: 'manual'
                }, 'editor');
                return;
            } else {
                throw new Error('SSH connection test failed - could not connect to device');
            }

        } catch (error) {
            this.logger.error('Connection test failed', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });

            this.sendMessageToWebview({
                type: 'connectionTestFailed',
                error: error instanceof Error ? error.message : 'Failed to verify SSH connection. Please ensure you copied your public key correctly.'
            });
        }
    }

    /**
     * Handle manual setup completion - test SSH connectivity
     */
    private async handleManualComplete(device: Device): Promise<void> {
        this.logger.info('Verifying manual SSH setup completion', { device: device.name });

        try {
            // Test SSH connectivity
            const testSuccessful = await this.connectionService.testSSHKeyConnectivity(device);

            if (testSuccessful) {
                this.logger.info('SSH setup verified successfully', { device: device.name });

                // Navigate to DNS registration view
                await this.navigateTo(DnsRegistrationViewController.viewId(), { 
                    device: device,
                    setupType: 'manual'
                }, 'editor');
                return;
            } else {
                throw new Error('SSH connection test failed');
            }

        } catch (error) {
            this.logger.error('Manual setup verification failed', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });

            this.sendMessageToWebview({
                type: 'manualError',
                error: error instanceof Error ? error.message : 'Failed to verify SSH connection. Please ensure you copied your public key correctly.'
            });
        }
    }

}
