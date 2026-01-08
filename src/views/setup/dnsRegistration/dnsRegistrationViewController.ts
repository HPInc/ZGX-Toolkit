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
import { DeviceService } from '../../../services/deviceService';
import { SetupSuccessViewController } from '../success/setupSuccessViewController';

/**
 * DNS registration view - handles DNS service registration with password prompt
 */
export class DnsRegistrationViewController extends BaseViewController {
    private readonly connectionService: ConnectionService;
    private readonly deviceService: DeviceService;
    private currentDevice?: Device;
    private setupType?: 'automatic' | 'manual' | 'migration';
    private checkTimeoutHandle?: NodeJS.Timeout;
    private navigationTimeoutHandle?: NodeJS.Timeout;
    private isDisposed = false;

    public static viewId(): string {
        return 'setup/dnsRegistration';
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            connectionService: ConnectionService;
            deviceService: DeviceService;
        }
    ) {
        super(deps.logger, deps.telemetry);
        this.connectionService = deps.connectionService;
        this.deviceService = deps.deviceService;
        this.template = this.loadTemplate('./dnsRegistration.html', __dirname);
        this.styles = this.loadTemplate('./dnsRegistration.css', __dirname);
        this.clientScript = this.loadTemplate('./dnsRegistration.js', __dirname);
    }

    async render(params?: { device: Device; setupType?: 'automatic' | 'manual' | 'migration' }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering mDNS registration view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to mDNS registration view');
            throw new Error('device required for DNS registration view');
        }

        // Store device and setup type for message handling
        this.currentDevice = params.device;
        this.setupType = params.setupType;

        const html = this.renderTemplate(this.template, {
            deviceName: params.device.name
        });

        // Show password prompt for DNS registration
        this.checkTimeoutHandle = setTimeout(async () => {
            if (this.isDisposed) {
                return;
            }
            try {
                await this.showPasswordPrompt();
            } catch (error) {
                if (this.isDisposed) {
                    return;
                }
                this.logger.error('Error showing password prompt', {
                    device: this.currentDevice?.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                // Fallback to showing password prompt on error
                this.sendMessageToWebview({ type: 'showPasswordPrompt' });
            }
        }, 100);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'setup.dnsRegistration',
            },
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Show password prompt for DNS registration
     */
    private async showPasswordPrompt(): Promise<void> {
        if (!this.currentDevice) {
            return;
        }

        this.logger.info('Prompting for password for mDNS registration', { device: this.currentDevice.name });

        // Always show password prompt to proceed with registration
        this.sendMessageToWebview({
            type: 'showPasswordPrompt'
        });
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('DNS registration view handling message', { type: message.type });

        if (!this.currentDevice) {
            this.logger.error('No device available for message handling');
            return;
        }

        if (message.type === 'validatePassword') {
            await this.handlePasswordValidation(message.password);
        } else {
            this.logger.debug('Unhandled message type in mDNS registration', { type: message.type });
        }
    }

    /**
     * Handle password validation and DNS registration
     */
    private async handlePasswordValidation(password: string): Promise<void> {
        if (!this.currentDevice) {
            this.logger.error('No device available for password validation');
            return;
        }

        try {
            // Validate password first
            const validationResult = await this.connectionService.validatePasswordForDNS(
                this.currentDevice,
                password
            );

            if (!validationResult.valid) {
                this.logger.warn('Password validation failed', {
                    isConnectionError: validationResult.isConnectionError
                });
                
                // Determine error message - connection errors are more serious
                const errorMessage = validationResult.isConnectionError
                    ? 'Connection error. Please check your network and try again.'
                    : (validationResult.error || 'Incorrect password. Please try again.');
                
                this.sendMessageToWebview({
                    type: 'passwordValidationResult',
                    valid: false,
                    error: errorMessage
                });
                return;
            }

            // Password is valid
            // Notify webview that validation succeeded
            this.sendMessageToWebview({
                type: 'passwordValidationResult',
                valid: true
            });

            // Start DNS registration
            await this.startDNSRegistration(password);

        } catch (error) {
            this.logger.error('Error during password validation', {
                error: error instanceof Error ? error.message : String(error)
            });

            this.sendMessageToWebview({
                type: 'passwordValidationResult',
                valid: false,
                error: 'An unexpected error occurred. Please try again.'
            });
        }
    }

    /**
     * Start DNS registration with validated password
     */
    private async startDNSRegistration(password: string): Promise<void> {
        if (!this.currentDevice) {
            return;
        }

        this.logger.info('Starting mDNS registration', { device: this.currentDevice.name });

        try {
            const registrationResult = await this.connectionService.registerDNSServiceWithAvahi(
                this.currentDevice,
                password
            );

            if (registrationResult.success) {
                await this.handleSuccessfulRegistration(registrationResult);
            } else {
                this.handleFailedRegistration(registrationResult);
            }
        } catch (error) {
            this.logger.error('Exception during mDNS registration', {
                device: this.currentDevice.name,
                error: error instanceof Error ? error.message : String(error)
            });

            this.sendMessageToWebview({
                type: 'registrationComplete',
                success: false,
                error: error instanceof Error ? error.message : 'Unexpected error during mDNS registration'
            });
        }
    }

    /**
     * Handle successful DNS registration
     */
    private async handleSuccessfulRegistration(registrationResult: any): Promise<void> {
        if (!this.currentDevice) {
            return;
        }

        this.logger.info('mDNS hpzgx service registered successfully', {
            device: this.currentDevice.name,
            identifier: registrationResult.deviceIdentifier
        });

        // Store the DNS instance name
        if (registrationResult.deviceIdentifier) {
            this.currentDevice.dnsInstanceName = registrationResult.deviceIdentifier;
        }

        // Persist changes to device store
        await this.deviceService.updateDevice(this.currentDevice.id, {
            dnsInstanceName: registrationResult.deviceIdentifier
        });

        // Notify webview of success
        this.sendMessageToWebview({
            type: 'registrationComplete',
            success: true
        });

        // Wait before navigating to success view
        this.navigationTimeoutHandle = setTimeout(async () => {
            if (!this.isDisposed) {
                await this.navigateToSuccess();
            }
        }, 1500);
    }

    /**
     * Handle failed DNS registration
     */
    private handleFailedRegistration(registrationResult: any): void {
        if (!this.currentDevice) {
            return;
        }

        this.logger.error('mDNS registration failed', {
            device: this.currentDevice.name,
            errorType: registrationResult.errorType,
            message: registrationResult.message
        });

        const isInvalidPassword = registrationResult.errorType === 'invalid_password';
        
        if (isInvalidPassword) {
            this.sendMessageToWebview({
                type: 'registrationComplete',
                success: false,
                error: 'Invalid password. Please try again.',
                allowRetry: true
            });
        } else {
            this.sendMessageToWebview({
                type: 'registrationComplete',
                success: false,
                error: registrationResult.message || 'DNS registration failed'
            });
        }
    }

    /**
     * Navigate to success view or device manager
     */
    private async navigateToSuccess(): Promise<void> {
        if (!this.currentDevice) {
            return;
        }

        // For migration, device is already setup - just navigate back to device manager
        if (this.setupType === 'migration') {
            this.logger.debug('mDNS registration complete for existing device, returning to device manager');
            const { DeviceManagerViewController } = await import('../../devices/manager/deviceManagerViewController');
            await this.navigateTo(DeviceManagerViewController.viewId(), {}, 'editor');
            return;
        }

        // For new setup, update device as setup complete and persist
        this.currentDevice.isSetup = true;
        this.currentDevice.useKeyAuth = true;
        this.currentDevice.keySetup = {
            keyGenerated: true,
            keyCopied: true,
            connectionTested: true
        };

        // Persist the setup completion
        await this.deviceService.updateDevice(this.currentDevice.id, {
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            }
        });

        if (this.setupType === 'manual') {
            await this.navigateTo(SetupSuccessViewController.viewId(), { 
                device: this.currentDevice, 
                setupType: 'manual' 
            }, 'editor');
        } else {
            await this.navigateTo(SetupSuccessViewController.viewId(), { 
                device: this.currentDevice 
            }, 'editor');
        }
    }

    /**
     * Dispose of resources and clear pending timeouts
     */
    public dispose(): void {
        this.isDisposed = true;
        
        if (this.checkTimeoutHandle) {
            clearTimeout(this.checkTimeoutHandle);
            this.checkTimeoutHandle = undefined;
        }
        
        if (this.navigationTimeoutHandle) {
            clearTimeout(this.navigationTimeoutHandle);
            this.navigationTimeoutHandle = undefined;
        }
    }
}
