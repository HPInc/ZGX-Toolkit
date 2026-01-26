/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { AppInstallationService, DeviceService } from '../../../services';
import { getAppById } from '../../../constants';
import { FineTuningInstructionsViewController } from '../finetuning/fineTuningInstructionsViewController';

/**
 * View for displaying Ollama inference instructions after app installation.
 * Provides step-by-step guide for running first LLM inference.
 */
export class InferenceInstructionsViewController extends BaseViewController {
    private readonly deviceService: DeviceService;
    private readonly appInstallationService: AppInstallationService;

    public static viewId(): string {
        return 'instructions/inference';
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            deviceService: DeviceService;
            appInstallationService: AppInstallationService;
        }
    ) {
        super(deps.logger, deps.telemetry);
        this.deviceService = deps.deviceService;
        this.appInstallationService = deps.appInstallationService;

        this.template = this.loadTemplate('./inferenceInstructions.html', __dirname);
        this.styles = this.loadTemplate('./inferenceInstructions.css', __dirname);
        this.clientScript = this.loadTemplate('./inferenceInstructions.js', __dirname);
    }

    /**
     * Render the inference instructions view.
     */
    async render(params?: { device?: Device; templateId?: string }, nonce?: string): Promise<string> {
        const device = params?.device;

        this.logger.debug('Rendering inference instructions view', {
            hasDevice: !!device,
            templateId: params?.templateId
        });

        const html = this.renderTemplate(this.template, {
            deviceId: device?.id,
            deviceName: device?.name
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'instructions.inference',
            }
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Handle messages from the webview.
     */
    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('Message received in inference instructions', { 
            type: message.type 
        });

        switch (message.type) {
            case 'connect-device': {
                try {
                    this.logger.info('Connecting to device from inference instructions', {
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

            case 'check-zgx-python-env': {
                this.logger.debug('Checking zgx-python-env installation status', {
                    deviceId: message.deviceId
                });
                
                const device = await this.deviceService.getDevice(message.deviceId);
                if (!device) {
                    this.logger.error('Device not found for zgx-python-env check', { 
                        deviceId: message.deviceId 
                    });
                    return;
                }

                // Get zgx-python-env app definition
                const zgxPythonEnvApp = getAppById('zgx-python-env');
                if (!zgxPythonEnvApp) {
                    this.logger.error('zgx-python-env app definition not found');
                    return;
                }

                // Check if the app is installed
                const isInstalled = await this.appInstallationService.verifyAppInstallation(
                    device, 
                    zgxPythonEnvApp
                );

                this.logger.debug('zgx-python-env installation check complete', {
                    deviceId: message.deviceId,
                    isInstalled
                });

                // Send response back to webview
                this.sendMessageToWebview({
                    type: 'zgx-python-env-status',
                    deviceId: message.deviceId,
                    isInstalled: isInstalled
                });
                break;
            }

            case 'continue-to-finetuning': {
                this.logger.info('Continuing to finetuning instructions', {
                    deviceId: message.deviceId
                });
                const device = await this.deviceService.getDevice(message.deviceId);
                this.navigateTo(FineTuningInstructionsViewController.viewId(), { device: device });
                break;
            }
        }
    }
}
