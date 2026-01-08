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
 * Automatic SSH setup view - guides users through automated SSH key setup
 */
export class AutomaticSetupViewController extends BaseViewController {
    private connectionService: ConnectionService;
    private currentDevice?: Device;

    public static viewId(): string {
        return 'setup/automatic';
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
        this.template = this.loadTemplate('./automaticSetup.html', __dirname);
        this.styles = this.loadTemplate('./automaticSetup.css', __dirname);
        this.clientScript = this.loadTemplate('./automaticSetup.js', __dirname);
    }

    async render(params?: { device: Device }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering automatic setup view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to automatic setup view');
            throw new Error('device required for automatic setup view');
        }

        // Store device for message handling
        this.currentDevice = params.device;

        const html = this.renderTemplate(this.template, {
            deviceName: params.device.name
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'setup.automatic',
            },
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('Automatic setup view handling message', { type: message.type });

        if (!this.currentDevice) {
            this.logger.error('No device available for message handling');
            return;
        }

        switch (message.type) {
            case 'automaticRun':
                await this.handleAutomaticRun(this.currentDevice);
                break;

            case 'testConnection':
                await this.handleTestConnection(this.currentDevice);
                break;

            case 'back':
                // Navigate back to setup options
                await this.navigateTo(SetupOptionsViewController.viewId(), { device: this.currentDevice });
                break;

            default:
                this.logger.debug('Unhandled message type in automatic setup', { type: message.type });
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
                    setupType: 'automatic'
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
                error: error instanceof Error ? error.message : 'Failed to verify SSH connection. Please try again or use manual setup.'
            });
        }
    }

    /**
     * Handle the automatic setup run action.
     * Generates SSH key and opens terminal with copy command.
     */
    private async handleAutomaticRun(device: Device): Promise<void> {
        this.logger.info('Starting automatic SSH setup', { device: device.name });

        try {
            // Step 1: Generate SSH key if needed
            const keyInfo = await this.connectionService.generateSSHKey();
            if (!keyInfo) {
                throw new Error('Failed to generate SSH key');
            }

            this.logger.debug('SSH key generated or already exists', { keyPath: keyInfo.keyPath });

            // Step 2: Open terminal with the copy command
            await this.connectionService.openTerminalForKeyCopy(device);

            // Notify UI that terminal is open
            this.sendMessageToWebview({ 
                type: 'automaticRunStarted',
                message: 'Integrated terminal opened. Please enter your password when prompted.'
            });

            this.logger.info('Automatic setup initiated - terminal opened');

        } catch (error) {
            this.logger.error('Automatic setup failed', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });

            this.sendMessageToWebview({
                type: 'automaticError',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
