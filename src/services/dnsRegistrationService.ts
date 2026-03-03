/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Service for managing the Avahi daemon hpzgx service registration on remote ZGX devices.
 * Handles device unique identifier generation and service file creation.
 */

import { Device } from '../types/devices';
import { logger } from '../utils/logger';
import { executeSSHCommand } from '../utils/sshConnection';
import { NET_DNSSD_SERVICES, NET_PROTOCOLS } from '../constants/net';

export enum RegistrationErrorType {
    NONE = 'none',
    SUDO_PASSWORD_REQUIRED = 'sudo_password_required',
    INVALID_PASSWORD = 'invalid_password',
    FILE_CHECK_FAILED = 'file_check_failed',
    IDENTIFIER_CALCULATION_FAILED = 'identifier_calculation_failed',
    SERVICE_FILE_CREATION_FAILED = 'service_file_creation_failed',
    AVAHI_RESTART_FAILED = 'avahi_restart_failed',
    SSH_CONNECTION_FAILED = 'ssh_connection_failed',
    UNKNOWN_ERROR = 'unknown_error'
}

export interface DnsServiceRegistrationResult {
    success: boolean;
    deviceIdentifier?: string;
    alreadyRegistered: boolean;
    errorType?: RegistrationErrorType;
    message?: string;
}

export class DNSServiceRegistration {

    private static readonly SERVICE_FILE_PATH = '/etc/avahi/services/hpzgx.service';
    private static readonly SERVICE_TYPE = `${NET_DNSSD_SERVICES.HPZGX}._${NET_PROTOCOLS.TCP}`;
    private static readonly SSH_PORT = 22;

    /**
     * Register the DNS hpzgx service with the Avahi daemon on the remote ZGX device.
     * 
     * @param device The device to register the service on
     * @param sudoPassword Sudo password for privileged operations
     * @returns Promise resolving to registration result
     */
    public async registerDNSService(device: Device, sudoPassword: string): Promise<DnsServiceRegistrationResult> {
        logger.info(`Registering mDNS hpzgx service on device ${device.name}`);

        try {
            // Check if sudo password is provided
            if (!sudoPassword) {
                logger.warn('Sudo password required but not provided');
                return this.createFailureResult(
                    RegistrationErrorType.SUDO_PASSWORD_REQUIRED,
                    'Sudo password required for DNS service registration'
                );
            }

            // Validate sudo password
            const validationResult = await this.validatePassword(device, sudoPassword);
            if (!validationResult.valid) {
                return this.handlePasswordValidationFailure(validationResult);
            }

            logger.info('Password validated successfully');

            const deviceIdentifier = await this.calculateDeviceIdentifier(device);
            if (!deviceIdentifier) {
                return this.createFailureResult(
                    RegistrationErrorType.IDENTIFIER_CALCULATION_FAILED,
                    'Failed to calculate device identifier'
                );
            }

            const createFileResult = await this.createServiceFile(device, deviceIdentifier, sudoPassword);
            if (!createFileResult.success) {
                return createFileResult;
            }

            return await this.restartAvahiDaemon(device, deviceIdentifier, sudoPassword);

        } catch (error) {
            return this.handleRegistrationException(device, error);
        }
    }

    /**
     * Handle password validation failure
     */
    private handlePasswordValidationFailure(validationResult: { valid: boolean; isConnectionError: boolean; error?: string }): DnsServiceRegistrationResult {
        const errorType = validationResult.isConnectionError
            ? RegistrationErrorType.SSH_CONNECTION_FAILED
            : RegistrationErrorType.INVALID_PASSWORD;
        const message = validationResult.isConnectionError
            ? `SSH connection failed: ${validationResult.error}`
            : 'Invalid password. Please try again.';
        
        logger.error(validationResult.isConnectionError 
            ? 'SSH connection failed during password validation'
            : 'Password validation failed');
        
        return this.createFailureResult(errorType, message);
    }

    /**
     * Calculate device unique identifier
     */
    private async calculateDeviceIdentifier(device: Device): Promise<string | null> {
        logger.debug('Calculating device unique identifier from MAC address hash');
        const identifierCommand = `ip route show default | awk '/default/ { print $5 }' | head -1 | xargs -I {} cat /sys/class/net/{}/address | tr -d ':' | sha256sum | cut -c1-8`;
        const identifierResult = await executeSSHCommand(
            device,
            identifierCommand,
            { readyTimeout: 30000 },
            { operationName: 'Calculate device identifier', timeoutSeconds: 30 }
        );
        
        if (!identifierResult.success || !identifierResult.stdout.trim()) {
            logger.error('Failed to calculate device identifier', {
                device: device.name,
                error: identifierResult.stderr
            });
            return null;
        }

        const deviceIdentifier = identifierResult.stdout.trim();
        logger.debug('Device identifier calculated', { 
            device: device.name,
            identifier: deviceIdentifier 
        });
        
        return deviceIdentifier;
    }

    /**
     * Create service file on remote device
     */
    private async createServiceFile(device: Device, deviceIdentifier: string, sudoPassword: string): Promise<DnsServiceRegistrationResult> {
        const serviceFileContent = this.generateServiceFileXML(deviceIdentifier);
        logger.debug('Creating hpzgx.service file on the ZGX device');
        
        const innerCommand = "echo '" + serviceFileContent + "' | tee " + DNSServiceRegistration.SERVICE_FILE_PATH + " > /dev/null";
        const createFileCommand = 'sudo -S bash -c ' + this.escapeShellArg(innerCommand);
        const createResult = await executeSSHCommand(
            device,
            createFileCommand,
            { readyTimeout: 30000 },
            { operationName: 'Create service file', sudoPassword, timeoutSeconds: 30 }
        );

        if (!createResult.success) {
            logger.error('Failed to create service file', {
                device: device.name,
                error: createResult.error,
                stderr: createResult.stderr,
                stdout: createResult.stdout
            });
            return this.createFailureResult(
                RegistrationErrorType.SERVICE_FILE_CREATION_FAILED,
                `Failed to create the DNS service file on the device.`
            );
        }
        
        logger.debug('Service file created successfully');
        return { success: true, alreadyRegistered: false, errorType: RegistrationErrorType.NONE };
    }

    /**
     * Restart Avahi daemon
     */
    private async restartAvahiDaemon(device: Device, deviceIdentifier: string, sudoPassword: string): Promise<DnsServiceRegistrationResult> {
        logger.debug('Restarting Avahi daemon');
        const restartCommand = 'sudo -S systemctl restart avahi-daemon';
        const restartResult = await executeSSHCommand(
            device,
            restartCommand,
            { readyTimeout: 30000 },
            { operationName: 'Restart Avahi', sudoPassword, timeoutSeconds: 30 }
        );

        if (!restartResult.success) {
            logger.warn('Failed to restart Avahi daemon', {
                device: device.name,
                stderr: restartResult.stderr
            });
            
            return {
                success: true,
                deviceIdentifier,
                alreadyRegistered: false,
                errorType: RegistrationErrorType.AVAHI_RESTART_FAILED,
                message: 'Service file created but Avahi daemon restart failed. Service will be active after next system restart.'
            };
        }

        logger.info('Avahi daemon restarted successfully for device', {
            device: device.name,
            identifier: deviceIdentifier
        });

        return {
            success: true,
            deviceIdentifier,
            alreadyRegistered: false,
            errorType: RegistrationErrorType.NONE
        };
    }

    /**
     * Handle exceptions during registration
     */
    private handleRegistrationException(device: Device, error: unknown): DnsServiceRegistrationResult {
        logger.error('Exception during hpzgx service registration', {
            device: device.name,
            error: error instanceof Error ? error.message : String(error)
        });
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConnectionError = errorMessage.toLowerCase().includes('connect') || 
            errorMessage.includes('ECONNREFUSED') || 
            errorMessage.toLowerCase().includes('etimedout') || 
            errorMessage.toLowerCase().includes('ehostunreach');
        
        const errorType = isConnectionError 
            ? RegistrationErrorType.SSH_CONNECTION_FAILED 
            : RegistrationErrorType.UNKNOWN_ERROR;
        
        return this.createFailureResult(errorType, errorMessage);
    }

    /**
     * Create a standardized failure result
     */
    private createFailureResult(errorType: RegistrationErrorType, message: string): DnsServiceRegistrationResult {
        return {
            success: false,
            alreadyRegistered: false,
            errorType,
            message
        };
    }

    /**
     * Register DNS service for existing devices (backwards compatibility).
     *
     * @param deviceService The device service for updating devices
     * @param vscodeWindow Optional VS Code window API for password prompting (defaults to vscode.window)
     */
    public async migrateExistingDevices(
        deviceService: any,
        vscodeWindow?: any
    ): Promise<void> {
        logger.info('Starting mDNS service migration for existing devices');

        const window = vscodeWindow || (await import('vscode')).window;

        try {
            const allDevices = await deviceService.getAllDevices();
            const candidateDevices = this.filterEligibleDevices(allDevices);
            
            if (candidateDevices.length === 0) {
                logger.info('No devices eligible for mDNS service migration');
                return;
            }

            const devicesToMigrate = await this.checkAndUpdateDeviceStatus(candidateDevices, deviceService);

            if (devicesToMigrate.length === 0) {
                logger.info('All eligible devices already have mDNS service registered');
                return;
            }

            // Notify user about devices requiring DNS registration
            logger.info('Checking mDNS registration for devices', { 
                count: devicesToMigrate.length,
                deviceNames: devicesToMigrate.map(d => d.name)
            });

            logger.info('mDNS registration requires passwords for devices', {
                count: devicesToMigrate.length,
                deviceNames: devicesToMigrate.map(d => d.name),
                note: 'Warning icons displayed in device list'
            });

            const deviceList = devicesToMigrate.map(d => d.name).join(', ');
            const message = devicesToMigrate.length === 1
                ? `The "${deviceList}" device requires mDNS service registration. Click the ⚠️ icon to complete the setup.`
                : `${devicesToMigrate.length} devices require mDNS service registration. Click the ⚠️ icon next to each device.`;
            
            await window.showInformationMessage(message, 'OK');

        } catch (error) {
            logger.error('mDNS service migration for existing devices failed', { 
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Filter devices that are eligible for DNS migration
     */
    private filterEligibleDevices(allDevices: Device[]): Device[] {
        return allDevices.filter(device => 
            device.isSetup === true &&
            device.useKeyAuth === true &&
            device.keySetup?.connectionTested === true
        );
    }

    /**
     * Check device status based on internal data (dnsInstanceName property)
     * Returns devices that need DNS registration (no dnsInstanceName or empty)
     */
    private async checkAndUpdateDeviceStatus(candidateDevices: Device[], deviceService: any): Promise<Device[]> {
        const devicesToMigrate: Device[] = [];

        for (const device of candidateDevices) {
            // Check if device has a DNS instance name set
            const hasDnsInstanceName = device.dnsInstanceName !== undefined &&
                device.dnsInstanceName !== null &&
                device.dnsInstanceName.trim().length > 0;
            
            if (!hasDnsInstanceName) {
                // Device needs DNS registration
                logger.info('Device needs mDNS registration', { 
                    device: device.name,
                    reason: 'No DNS instance name'
                });
                devicesToMigrate.push(device);
            }
        }

        return devicesToMigrate;
    }

    /**
     * Escape XML special characters in a string.
     */
    private escapeXML(str: string): string {
        return str
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&apos;');
    }

     /**
    * Generate the XML content for the DNS service file.
    * 
    * @param deviceIdentifier The unique identifier for the device
    * @returns XML string for the service file
    */
    private generateServiceFileXML(deviceIdentifier: string): string {
        const escapedIdentifier = this.escapeXML(deviceIdentifier);
        return `<service-group>
  <name>${escapedIdentifier}</name>
  <service>
    <type>${DNSServiceRegistration.SERVICE_TYPE}</type>
    <port>${DNSServiceRegistration.SSH_PORT}</port>
  </service>
</service-group>`;
    }

    /**
     * Escape shell argument for safe command execution.
     */
    private escapeShellArg(arg: string): string {
        const escaped = arg.replaceAll("'", String.raw`'\''`);
        return `'${escaped}'`;
    }

    /**
     * Check if hpzgx.service file already exists on the device.
     * 
     * @param device The device to check
     * @returns Promise resolving to whether file exists, with error details and connection error flag
     */
    public async checkServiceFileExists(device: Device): Promise<{ exists: boolean; error?: string; isConnectionError?: boolean }> {
        logger.debug('Checking if hpzgx.service file already exists');
        
        try {
            const checkResult = await executeSSHCommand(
                device,
                `test -f ${DNSServiceRegistration.SERVICE_FILE_PATH} && echo "exists" || echo "not_exists"`,
                { readyTimeout: 30000 },
                { operationName: 'Check service file exists', timeoutSeconds: 30 }
            );

            if (!checkResult.success) {
                logger.error('Failed to check for existing service file', { 
                    device: device.name,
                    error: checkResult.stderr
                });
                
                // Check if this is an SSH connection error
                const errorMessage = checkResult.stderr.toLowerCase();
                const isConnectionError = errorMessage.includes('econnrefused') ||
                    errorMessage.includes('etimedout') || 
                    errorMessage.includes('ehostunreach') ||
                    errorMessage.includes('connection') ||
                    errorMessage.includes('connect');
                
                return {
                    exists: false,
                    error: checkResult.stderr,
                    isConnectionError
                };
            }

            const fileExists = checkResult.stdout.trim() === 'exists';
            
            if (fileExists) {
                logger.info('hpzgx.service file already exists', {
                    device: device.name
                });
            }
            
            return { exists: fileExists };

        } catch (error) {
            logger.error('Exception checking service file existence', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorMessageLower = errorMessage.toLowerCase();
            const isConnectionError = errorMessageLower.includes('econnrefused') ||
                errorMessageLower.includes('etimedout') ||
                errorMessageLower.includes('ehostunreach') ||
                errorMessageLower.includes('connection') ||
                errorMessageLower.includes('connect');
            
            return {
                exists: false,
                error: errorMessage,
                isConnectionError
            };
        }
    }

    /**
     * Validate sudo password by attempting a simple sudo command.
     * Returns validation result with connection error flag.
     * 
     * @param device The device to validate password on
     * @param password The sudo password to validate
     * @returns Promise resolving to validation result with connection error indicator
     */
    public async validatePassword(device: Device, password: string): Promise<{valid: boolean, isConnectionError: boolean, error?: string}> {
        logger.info('Validating sudo password');

        // Use executeSSHCommand with a simple sudo test command
        const testCommand = 'sudo -S true';
        const result = await executeSSHCommand(
            device,
            testCommand,
            { readyTimeout: 30000 },
            { operationName: 'sudo validation', sudoPassword: password, timeoutSeconds: 10 }
        );

        if (!result.success) {
            const errorMessage = result.error?.message || result.stderr || '';
            const errorMessageLower = errorMessage.toLowerCase();
            const isConnectionError = errorMessageLower.includes('econnrefused') || 
                                     errorMessageLower.includes('etimedout') ||
                                     errorMessageLower.includes('ehostunreach') ||
                                     errorMessageLower.includes('connection timeout') ||
                                     errorMessageLower.includes('connect econnrefused');
            
            const isIncorrectPassword = errorMessageLower.includes('incorrect password') ||
                                       errorMessageLower.includes('sorry, try again') ||
                                       errorMessageLower.includes('authentication failure') ||
                                       (errorMessageLower.includes('sudo') && errorMessageLower.includes('password'));
            
            logger.error('Sudo password validation failed', { 
                device: device.name, 
                error: result.error?.message, 
                stderr: result.stderr,
                isConnectionError,
                isIncorrectPassword
            });
            
            // Provide user-friendly error messages
            let userFriendlyError: string;
            if (isConnectionError) {
                userFriendlyError = 'Connection error. Please check your network and try again.';
            } else if (isIncorrectPassword) {
                userFriendlyError = 'Incorrect password. Please try again.';
            } else {
                userFriendlyError = 'Password validation failed. Please check your device SSH connection and try again.';
            }
            
            return {
                valid: false,
                isConnectionError,
                error: userFriendlyError
            };
        }
        
        return { valid: true, isConnectionError: false };
    }

}


export const dnsServiceRegistration = new DNSServiceRegistration();
