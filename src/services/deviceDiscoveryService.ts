/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as dnssd from 'dnssd';
import * as os from 'os';
import * as net from 'net';
import { logger } from '../utils/logger';
import { DiscoveredDevice } from '../types/devices';
import { ITelemetryService, TelemetryEventType } from '../types/telemetry';
import { telemetryService } from './telemetryService';

/**
 * Configuration options for DeviceDiscoveryService
 */
export interface DeviceDiscoveryServiceConfig {
    telemetry: ITelemetryService;
};

export class DeviceDiscoveryService {
    private config: DeviceDiscoveryServiceConfig;
    
    private static readonly ZGX_HOSTNAME_PATTERNS = [
        /^zgx-[A-Za-z0-9]{6}$/,     // HP Factory Pattern (6 character): zgx-XXXXXX
        /^zgx-[A-Za-z0-9]{4}$/,     // HP Factory Pattern (4 character): zgx-XXXX
        /^spark-[A-Za-z0-9]{4}$/    // NVIDIA Default Pattern: spark-XXXX
    ];

    constructor(config: DeviceDiscoveryServiceConfig) {
        this.config = config;
    }

    /**
     * Gets all active network interfaces with IPv4 addresses
     * @returns Array of network interface addresses
     */
    private getNetworkInterfaces(): string[] {
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];

        for (const [name, netInterfaces] of Object.entries(interfaces)) {
            if (!netInterfaces) {
                continue;
            }

            for (const netInterface of netInterfaces) {
                // Only include IPv4 addresses that are not internal (loopback)
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    addresses.push(netInterface.address);
                }
            }
        }

        return addresses;
    }

    /**
     * Records the device if its hostname matches known ZGX patterns.
     * @param service Service info from mDNS
     * @param discoveredDevices The map to record discovered devices
     */
    private recordDeviceIfZGX(service: dnssd.Service, discoveredDevices: Map<string, DiscoveredDevice>): void {
        // Extract hostname and remove .local suffix and any trailing characters
        const parts = service.host.split('.local');
        const hostname = parts[0] || '';

        let isZgx = DeviceDiscoveryService.ZGX_HOSTNAME_PATTERNS.some(pattern => pattern.test(hostname));

        if (isZgx) {
            // Filter to only include IPv4 addresses. We can remove this later if we want
            // to show IPv6 addresses as well.
            const ipv4Addresses = service.addresses.filter(addr => net.isIPv4(addr));

            logger.debug(`ZGX device found: ${hostname}`);
            discoveredDevices.set(hostname, {
                name: service.name,
                hostname: hostname,
                addresses: ipv4Addresses,
                port: service.port
            });
        }
    }

    /**
     * Discovers ZGX devices on the local network using mDNS
     * Creates a separate mDNS client for each network interface to ensure discovery on all connected networks
     * @param timeoutMs Maximum time to wait for discovery (default: 5000ms)
     * @returns Promise resolving to array of discovered devices
     */
    public async discoverDevices(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
        return new Promise((resolve) => {

            const discoveredDevices = new Map<string, DiscoveredDevice>();
            const browsers: dnssd.Browser[] = [];

            // Clean up function to close all browsers
            const cleanUp = (browsers: dnssd.Browser[]) => {
                browsers.forEach(browser => {
                    if (browser && typeof browser.stop === 'function') {
                        browser.stop();
                    }
                })
            }

            logger.info('Starting device discovery on all network interfaces...');

            try {
                for (const addr of this.getNetworkInterfaces()) {
                    try {
                        const browser = new dnssd.Browser(dnssd.tcp('_ssh'), { interface: addr, resolve: true });

                        browser.on('serviceUp', (service: dnssd.Service) => {
                            this.recordDeviceIfZGX(service, discoveredDevices);
                        });

                        browsers.push(browser);
                    } catch (error) {
                        logger.error(`Failed to create browser for interface ${addr}: ${error instanceof Error ? error.message : String(error)}`);
                        continue;
                    }
                }

                if (browsers.length === 0) {
                    logger.warn('No active network interfaces found, cannot perform discovery');
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'discover',
                        properties: {
                            method: 'dns-sd',
                            result: 'no-interfaces'
                        },
                        measurements: {
                            deviceCount: 0
                        }
                    });
                    resolve([]);
                    return;
                }

                // Start discovery on all browsers
                browsers.forEach(browser => browser.start());

                logger.info(`mDNS discovery started on ${browsers.length} interface(s)`);

                // Stop discovery after timeout
                setTimeout(() => {
                    logger.info(`Discovery finished after ${timeoutMs}ms`);
                    cleanUp(browsers);
                    
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'discover',
                        properties: {
                            method: 'dns-sd',
                            result: 'success',
                        },
                        measurements: {
                            deviceCount: discoveredDevices.size,
                        }
                    });
                    
                    resolve(Array.from(discoveredDevices.values()));
                }, timeoutMs);
            } catch (error) {
                logger.error(`mDNS discovery failed: ${error instanceof Error ? error.message : String(error)}`);
                cleanUp(browsers);
                this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device-discovery' });
                
                resolve([]);
            }
        });
    }

}

export const deviceDiscoveryService = new DeviceDiscoveryService({ telemetry: telemetryService });
