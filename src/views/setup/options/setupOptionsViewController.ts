/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService } from '../../../types/telemetry';
import { Message, SetupOptionSelectedMessage } from '../../../types/messages';
import { Device } from '../../../types/devices';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';
import { ManualSetupViewController } from '../manual/manualSetupViewController';
import { AutomaticSetupViewController } from '../automatic/automaticSetupViewController';

/**
 * Setup Options View - Shows available SSH setup methods.
 * Allows user to choose between automatic, manual, or password key setup.
 */
export class SetupOptionsViewController extends BaseViewController {
    private currentDevice?: Device;

    public static viewId(): string {
        return 'setup/options';
    }

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
    }) {
        super(deps.logger, deps.telemetry);

        this.template = this.loadTemplate('./setupOptions.html', __dirname);
        this.styles = this.loadTemplate('./setupOptions.css', __dirname);
        this.clientScript = this.loadTemplate('./setupOptions.js', __dirname);
    }

    async render(params?: { device: Device }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering setup options view', { deviceName: params?.device.name });

        if (!params || !params.device) {
            this.logger.error('Missing required device parameter for setup options view');
            throw new Error('device is required');
        }

        // Store device for message handling
        this.currentDevice = params.device;

        const data = {
            deviceName: params.device.name,
        };

        const html = this.renderTemplate(this.template, data);
        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        if (!this.currentDevice) {
            this.logger.error('No device available for message handling');
            return;
        }

        switch (message.type) {
            case 'navigate-back':
                // Navigate back to device manager view
                this.logger.debug('User cancelled setup options, navigating to device manager');
                await this.navigateTo(DeviceManagerViewController.viewId(), { device: this.currentDevice });
                break;

            case 'setup-option-selected':
                await this.handleOptionSelected(message as SetupOptionSelectedMessage);
                break;

            default:
                this.logger.debug('Unhandled message type in setup options', { type: message.type });
        }
    }

    private async handleOptionSelected(message: SetupOptionSelectedMessage): Promise<void> {
        const option = message.option;
        this.logger.info('Setup option selected', { option, device: this.currentDevice?.name });

        // Navigate to the appropriate setup view
        switch (option) {
            case 'automatic':
                await this.navigateTo(AutomaticSetupViewController.viewId(), { device: this.currentDevice });
                break;
            case 'manual':
                await this.navigateTo(ManualSetupViewController.viewId(), { device: this.currentDevice });
                break;
            default:
                this.logger.error('Unknown setup option selected', { option });
        }
    }
}
