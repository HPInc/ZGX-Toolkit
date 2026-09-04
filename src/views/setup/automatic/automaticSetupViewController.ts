/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseSetupViewController } from '../baseSetupViewController';
import { SETUP_VIEW_IDS } from '../setupViewIds';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { ConnectionService } from '../../../services/connectionService';
import { SetupOptionsViewController } from '../options/setupOptionsViewController';
import { DetectDeviceTypeViewController } from '../detectDeviceType/detectDeviceTypeViewController';


/**
 * Automatic SSH setup view - guides users through automated SSH key setup
 */
export class AutomaticSetupViewController extends BaseSetupViewController {

    private currentDevice?: Device;

    public static viewId(): string {
        return SETUP_VIEW_IDS.automatic;
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            connectionService: ConnectionService;
        }
    ) {
        super(deps);
        this.template = this.loadTemplate('setup/automatic/automaticSetup.html');
        this.styles = this.loadTemplate('setup/automatic/automaticSetup.css');
        this.clientScript = this.loadTemplate('setup/automatic/automaticSetup.js');
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
                toView: 'setup.automatic'
            }
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

            case 'testConnection': {
                const success = await this.handleTestConnection(
                    this.currentDevice,
                    'Failed to verify SSH connection. Please try again or use manual setup.'
                );
                if (success) {
                    await this.navigateTo(DetectDeviceTypeViewController.viewId(), {
                        device: this.currentDevice,
                        setupType: 'automatic'
                    }, 'editor');
                }
                break;
            }

            case 'back':
                // Navigate back to setup options
                await this.navigateTo(SetupOptionsViewController.viewId(), { device: this.currentDevice });
                break;

            default:
                this.logger.debug('Unhandled message type in automatic setup', { type: message.type });
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
