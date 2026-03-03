/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device health check service for SSH connectivity verification.
 * Provides methods to ping devices and verify SSH connectivity before performing operations.
 */

import { Device } from '../types/devices';
import { logger } from '../utils/logger';
import { testSSHConnection } from '../utils/sshConnection';

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
            const connectionResult = await testSSHConnection(
                device,
                {
                    readyTimeout: DeviceHealthCheckService.HEALTH_CHECK_TIMEOUT,
                    timeout: DeviceHealthCheckService.HEALTH_CHECK_TIMEOUT
                }
            );
            
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

}

export const deviceHealthCheckService = new DeviceHealthCheckService();
