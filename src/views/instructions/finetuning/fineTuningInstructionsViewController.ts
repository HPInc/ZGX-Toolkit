/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { DeviceService } from '../../../services';

/**
 * View for displaying fine-tuning instructions using torchtune.
 * Provides step-by-step guide for running first model fine-tuning.
 */
export class FineTuningInstructionsViewController extends BaseViewController {
    private readonly deviceService: DeviceService;

    public static viewId(): string {
        return 'instructions/finetuning';
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            deviceService: DeviceService;
        }
    ) {
        super(deps.logger, deps.telemetry);
        this.deviceService = deps.deviceService;

        this.template = this.loadTemplate('./fineTuningInstructions.html', __dirname);
        this.styles = this.loadTemplate('./fineTuningInstructions.css', __dirname);
        this.clientScript = this.loadTemplate('./fineTuningInstructions.js', __dirname);
    }

    /**
     * Render the fine-tuning instructions view.
     */
    async render(params?: { device?: Device; templateId?: string }, nonce?: string): Promise<string> {
        const device = params?.device;

        this.logger.debug('Rendering fine-tuning instructions view', {
            hasDevice: !!device,
            templateId: params?.templateId
        });

        const html = this.renderTemplate(this.template, {
            deviceName: device?.name,
            deviceId: device?.id
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'instructions.finetuning',
            }
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Handle messages from the webview.
     */
    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        switch (message.type) {
            case 'connect-device': {
                try {
                    this.logger.info('Connecting to device from fine-tuning instructions', {
                        deviceId: message.id
                    });
    
                    await this.deviceService.connectToDevice(message.id, message.newWindow);
                    
                    this.logger.info('Successfully initiated connection to device', {
                        deviceId: message.id,
                    });

                } catch (error) {
                    this.logger.error('Failed to connect to device', { 
                        error,
                        deviceId: message.id
                    });
                }
                break;
            }
        }
    }
}
