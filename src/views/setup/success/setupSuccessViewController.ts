/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { DeviceService } from '../../../services/deviceService';
import { AppSelectionViewController } from '../../apps/selection/appSelectionViewController';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';

/**
 * Setup type for determining success message
 */
type SetupType = 'automatic' | 'manual' | 'password';

/**
 * Setup success view - displays success message after completing SSH setup
 */
export class SetupSuccessViewController extends BaseViewController {
    private deviceService: DeviceService;
    private currentDevice?: Device;

    private readonly setupMessages = {
        automatic: {
            icon: '🎉',
            title: 'Automatic Setup Complete!',
            message: 'SSH key authentication has been successfully configured. You can now connect without entering a password.'
        },
        manual: {
            icon: '✅',
            title: 'Manual Setup Complete!',
            message: 'SSH key authentication should now be configured. VS Code will attempt passwordless connection.'
        },
        password: {
            icon: '🔑',
            title: 'Password Authentication Ready!',
            message: 'The device is configured to use password authentication. You will be prompted for your password when connecting.'
        }
    };

    public static viewId(): string {
        return 'setup/success';
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
        this.template = this.loadTemplate('./setupSuccess.html', __dirname);
        this.styles = this.loadTemplate('./setupSuccess.css', __dirname);
        this.clientScript = this.loadTemplate('./setupSuccess.js', __dirname);
    }

    async render(params?: { device: Device; setupType?: SetupType }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering setup success view', { 
            device: params?.device?.name,
            setupType: params?.setupType
        });

        if (!params?.device) {
            this.logger.error('No device provided to setup success view');
            throw new Error('device required for setup success view');
        }

        // Store device for message handling
        this.currentDevice = params.device;

        // Determine setup type based on device's keySetup if not provided
        let setupType: SetupType = params.setupType || 'automatic';
        if (!params.setupType) {
            if (params.device.useKeyAuth) {
                setupType = 'automatic'; // Default to automatic if using keys
            } else {
                setupType = 'password';
            }
        }

        const setup = this.setupMessages[setupType];

        const html = this.renderTemplate(this.template, {
            icon: setup.icon,
            title: setup.title,
            message: setup.message,
            deviceName: params.device.name,
            deviceId: params.device.id
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'setup.success',
                setupType
            },
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('Setup success view handling message', { type: message.type });

        switch (message.type) {
            case 'setup-complete':
                // User clicked continue after setup success
                this.logger.debug('User completed setup, navigating to app selection');
                if (this.currentDevice) {
                    await this.navigateTo(AppSelectionViewController.viewId(), { 
                        device: this.currentDevice 
                    }, 'editor');
                } else {
                    this.logger.error('Cannot navigate: no current device');
                }
                break;

            case 'cancel':
                // User cancelled/closed the setup
                await this.navigateTo(DeviceManagerViewController.viewId(), { 
                    device: this.currentDevice 
                }, 'editor');
                break;

            default:
                // Other messages handled by base class
                break;
        }
    }
}
