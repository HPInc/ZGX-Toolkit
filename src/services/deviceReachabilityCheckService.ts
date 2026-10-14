/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device health check service for SSH connectivity verification.
 * Provides methods to ping devices and verify SSH connectivity before performing operations.
 */

import { deviceReachabilityStore } from '../store';
import { connectionStateStore } from '../store/connectionStateStore';
import { Device } from '../types/devices';
import { DeviceStatus } from '../types/devicestatus';
import { logger } from '../utils/logger';
import * as net from 'node:net';

/*
 * Device reachability probe result
 */

export interface DeviceReachabilityProbeResult {
    success: boolean;
    error?: string;
}

/**
 * Service for checking device health and connectivity.
 */
export class DeviceReachabilityCheckService {
    private static readonly HEALTH_CHECK_TIMEOUT = 5000;

    // Per-device generation counter: guards against an older, slower-to-resolve probe
    // overwriting the result of a newer probe started for the same device (e.g. a manual
    // "Check Status" click racing the background updater).
    private readonly deviceCheckTokens = new Map<string, number>();

    /**
     * Start a new probe generation for a device, superseding any probe already in flight.
     * @returns the token the caller must present to isCurrentDeviceCheck to accept its result
     */
    private beginDeviceCheck(deviceId: string): number {
        const token = (this.deviceCheckTokens.get(deviceId) ?? 0) + 1;
        this.deviceCheckTokens.set(deviceId, token);
        return token;
    }

    /**
     * Whether the given token is still the most recent probe started for this device.
     * A false result means a newer check superseded it, so its result should be discarded.
     */
    private isCurrentDeviceCheck(deviceId: string, token: number): boolean {
        return this.deviceCheckTokens.get(deviceId) === token;
    }

    /**
     * Perform a light check to determine if the device is reachable over the network.
     * This check is less comprehensive than a full health check and primarily focuses on network reachability.
     * 
     * @param device The device to health check
     * @returns Promise resolving to health check result
     */
    private async checkDeviceReachability(device: Device): Promise<DeviceReachabilityProbeResult> {
        logger.debug('Starting reachability check for device', { device: device.name });

        return new Promise<DeviceReachabilityProbeResult>(resolve => {
            let settled = false;
            const settle = (result: DeviceReachabilityProbeResult): void => {
                if (settled) {
                    return;
                }
                settled = true;
                connection.destroy();
                resolve(result);
            };

            let connection: net.Socket;
            try {
                // attempt a light TCP level probe
                connection = net.createConnection({
                    host: device.host,
                    port: device.port,
                    timeout: DeviceReachabilityCheckService.HEALTH_CHECK_TIMEOUT
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                resolve({ success: false, error: errorMessage });
                return;
            }

            connection.on('connect', () => {
                settle({ success: true });
            });

            connection.on('error', (err) => {
                settle({ success: false, error: err.message });
            });

            connection.on('timeout', () => {
                settle({ success: false, error: 'Connection timed out' });
            });
        });
    }

    /* 
     * User facing function that takes one or more devices and updates their reachability status in the reachability store.
     *
     * @param devices Array of devices to check reachability for
     * @param explicit Whether this check was directly requested by the user (e.g. "Check
     * Status"/"Refresh Status"), as opposed to a silent background check. Forwarded to the
     * store so every view animates consistently regardless of which one initiated the check.
     * @returns Promise that resolves when all reachability checks are complete
     */
    public async checkDevicesReachability(devices: Device[], explicit = false): Promise<void> {
        // Implementation for checking reachability of multiple devices
        // This would typically involve calling checkDeviceReachability for each device
        // and updating the reachability store accordingly.
        let queryCompleted = false;
        try {
            // dont bother checking already connected devices
            const devicesToCheck = devices.filter(device => !connectionStateStore.isConnected(device.id));
            const tokens = devicesToCheck.map(device => this.beginDeviceCheck(device.id));
            deviceReachabilityStore.beginChecking(devicesToCheck.map(device => device.id), explicit);

            const reachabilityChecks = devicesToCheck.map(device => this.checkDeviceReachability(device));
            const results = await Promise.allSettled(reachabilityChecks);

            const accepted: { deviceId: string; status: DeviceStatus; error?: string }[] = [];
            results.forEach((result, index) => {
                const device = devicesToCheck[index];

                // A newer check for this device started (and possibly already finished) while
                // this one was in flight; its result is stale, so it must not overwrite the store.
                if (!this.isCurrentDeviceCheck(device.id, tokens[index])) {
                    logger.debug('Discarding stale reachability result superseded by a newer check', { device: device.name });
                    return;
                }

                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        accepted.push({ deviceId: device.id, status: DeviceStatus.Reachable });
                    } else {
                        accepted.push({ deviceId: device.id, status: DeviceStatus.Unreachable, error: result.value.error });
                    }
                } else {
                    accepted.push({ deviceId: device.id, status: DeviceStatus.Unreachable, error: String(result.reason) });
                }
            });

            // Single notify for the whole query instead of one per device.
            deviceReachabilityStore.completeQuery(accepted);
            queryCompleted = true;
        } catch (error) {
            // Handle any unexpected errors during the reachability checks
            logger.error('Error checking devices reachability', { error });
        }
        finally{
            // Only needed if completeQuery above wasn't reached (e.g. devices was invalid).
            if (!queryCompleted) {
                deviceReachabilityStore.markQueryCompleted();
            }
        }
    }

}

export const deviceReachabilityCheckService = new DeviceReachabilityCheckService();
