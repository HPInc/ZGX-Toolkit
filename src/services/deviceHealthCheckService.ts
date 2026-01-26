/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device health check service for SSH connectivity verification.
 * Provides methods to ping devices and verify SSH connectivity before performing operations.
 */

import { Client as SSHClient } from 'ssh2';
import { Device } from '../types/devices';
import { logger } from '../utils/logger';
import { getSSHConfig } from '../utils/sshConfig';

/**
 * Device health check result
 */
export interface DeviceHealthCheckResult {
    isHealthy: boolean;
    error?: string;
    device: string;
}

/**
 * Service for checking device health and connectivity.
 */
export class DeviceHealthCheckService {
    private static readonly HEALTH_CHECK_TIMEOUT = 5000;

    /**
     * Perform a health check on a device by attempting SSH connection.
     * This is a lightweight operation that just verifies connectivity without executing commands.
     * 
     * @param device The device to health check
     * @returns Promise resolving to health check result
     */
    public async checkDeviceHealth(device: Device): Promise<DeviceHealthCheckResult> {
        const result: DeviceHealthCheckResult = {
            isHealthy: false,
            device: device.name
        };

        logger.debug('Starting health check for device', { device: device.name });

        try {
            // Attempt SSH connection
            const connectionResult = await this.testSSHConnection(device);
            
            if (connectionResult.success) {
                result.isHealthy = true;
                logger.info('Device health check successful', { device: device.name });
            } else {
                result.error = connectionResult.error || 'Failed to establish SSH connection';
                
                logger.warn('Device health check failed', { 
                    device: device.name,
                    error: result.error
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.error = errorMessage;
            
            logger.error('Device health check exception', { 
                device: device.name,
                error: errorMessage 
            });
        }

        return result;
    }

    /**
     * Test SSH connection to device without executing commands.
     * Establishes connection and immediately closes it.
     * 
     * @param device The device to test
     * @returns Promise resolving to connection result with success status and error details
     */
    private async testSSHConnection(device: Device): Promise<{ success: boolean; error?: string }> {
        let client: SSHClient | undefined;
        let timeoutHandle: NodeJS.Timeout | undefined;

        return new Promise((resolve) => {
            try {
                client = new SSHClient();
                let connected = false;
                let resolved = false;

                const cleanup = () => {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                        timeoutHandle = undefined;
                    }
                    if (client) {
                        try {
                            // Attempt to gracefully close the connection
                            client.end();
                        } catch (error) {
                            logger.debug('SSH client cleanup: connection already closed or in error state', {
                                error: error instanceof Error ? error.message : String(error)
                            });
                        }
                    }
                };

                const resolveOnce = (result: { success: boolean; error?: string }) => {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve(result);
                    }
                };

                client.on('ready', () => {
                    connected = true;
                    resolveOnce({ success: true });
                });

                client.on('error', (err) => {
                    let errorMessage = err.message;
                    
                    // Normalize timeout errors for better user-facing messages
                    if (errorMessage.includes('Timed out while waiting for handshake')) {
                        errorMessage = 'Connection timeout during SSH handshake';
                    }
                    
                    logger.debug('SSH connection error during health check', {
                        device: device.name,
                        error: err.message
                    });
                    resolveOnce({ success: false, error: errorMessage });
                });

                client.on('close', () => {
                    if (!connected && !resolved) {
                        resolveOnce({ success: false, error: 'Connection closed unexpectedly' });
                    }
                });

                // Set timeout for connection attempt with a small buffer beyond the SSH library's timeout
                // to ensure the library's more specific error messages are reported first
                timeoutHandle = setTimeout(() => {
                    logger.debug('SSH connection timeout during health check', { device: device.name });
                    resolveOnce({ success: false, error: 'Connection timeout' });
                }, DeviceHealthCheckService.HEALTH_CHECK_TIMEOUT + 100);

                // Get SSH configuration and connect
                const config = getSSHConfig(device, {
                    readyTimeout: DeviceHealthCheckService.HEALTH_CHECK_TIMEOUT,
                    timeout: DeviceHealthCheckService.HEALTH_CHECK_TIMEOUT
                });
                client.connect(config);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.debug('Exception during SSH connection test', {
                    device: device.name,
                    error: errorMessage
                });
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                resolve({ success: false, error: errorMessage });
            }
        });
    }
}

export const deviceHealthCheckService = new DeviceHealthCheckService();
