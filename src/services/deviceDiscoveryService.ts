/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as dnssd from 'dnssd';
import * as os from 'os';
import * as net from 'net';
import { logger } from '../utils/logger';
import { NET_PROTOCOLS, NET_DNSSD_SERVICES, NetProtocol } from '../constants/net';
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
     * Discovers services of a given type on all network interfaces using DNS-SD.
     * @param serviceType The DNS-SD service type to discover (e.g., '_ssh', '_hpzgx')
     * @param proto The network protocol (TCP/UDP) to use for discovery
     * @param timeoutMs The duration in milliseconds to run the discovery before stopping
     * @returns A promise that resolves to an array of discovered devices
     */
    public async discoverService(serviceType: string, proto: NetProtocol, timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
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
                        const st: dnssd.ServiceType = proto === NET_PROTOCOLS.TCP
                            ? dnssd.tcp(serviceType)
                            : dnssd.udp(serviceType);

                        const browser = new dnssd.Browser(st, { interface: addr, resolve: true });

                        browser.on('serviceUp', (service: dnssd.Service) => {
                            const parts = service.host.split('.local');
                            const hostname = parts[0] || '';
                            const ipv4Addresses = service.addresses.filter(addr => net.isIPv4(addr));
                            discoveredDevices.set(hostname, {
                                name: service.name,
                                hostname: hostname,
                                addresses: ipv4Addresses,
                                port: service.port,
                                protocol: proto,
                            });
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

    /**
     * Records the device if its hostname matches known ZGX hostname patterns.
     * @param device Device info from DNS-SD discovery
     * @param discoveredDevices The map to record discovered devices
     */
    private recordDeviceIfZGXHostname(device: DiscoveredDevice, discoveredDevices: Map<string, DiscoveredDevice>): void {
        // Does the hostname match ZGX patterns?
        const isZgxHostname = DeviceDiscoveryService.ZGX_HOSTNAME_PATTERNS.some(pattern => pattern.test(device.hostname));

        if (isZgxHostname) {
            logger.debug(`ZGX device found: ${device.hostname}`);
            discoveredDevices.set(device.hostname, device);
        }
    }

    /**
     * Discovers ZGX devices on the local network using DNS-SD.
     * @param timeoutMs Maximum time to wait for discovery (default: 5000ms)
     * @returns Promise resolving to array of discovered devices
     */
    public async discoverDevices(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
        const zgxDevices = new Map<string, DiscoveredDevice>();

        // Run both discovery operations in parallel
        const results = await Promise.allSettled([
            this.discoverService(NET_DNSSD_SERVICES.SSH, NET_PROTOCOLS.TCP, timeoutMs),
            this.discoverService(NET_DNSSD_SERVICES.HPZGX, NET_PROTOCOLS.TCP, timeoutMs)
        ]);

        // Process SSH devices (if successful)
        if (results[0].status === 'fulfilled') {
            for (const sshDevice of results[0].value) {
                this.recordDeviceIfZGXHostname(sshDevice, zgxDevices);
            }
        }
        
        // Process HPZGX devices (if successful)
        // These are assumed to be ZGX devices because they advertise the _hpzgx service.
        // It is possible for a ZGX to advertise both _ssh and _hpzgx services. To avoid
        // duplicates, we overwrite an existing entry with the _hpzgx version.
        if (results[1].status === 'fulfilled') {
            for (const hpzgxDevice of results[1].value) {
                zgxDevices.set(hpzgxDevice.hostname, hpzgxDevice);
            }
        }

        this.config.telemetry.trackEvent({
            eventType: TelemetryEventType.Device,
            action: 'discover',
            properties: {
                method: 'dns-sd',
                result: 'success'
            },
            measurements: {
                deviceCount: zgxDevices.size
            }
        });

        return Array.from(zgxDevices.values());
    }

    /**
     * Rediscover devices based on a list of known DNS-SD instance names. Only looks for devices advertising the _hpzgx service.
     * @param dnssdInstances Array of DNS-SD instance names to look for
     * @param timeoutMs Maximum time to wait for discovery (default: 5000ms)
     * @returns Promise resolving to array of rediscovered devices. Each returned device will have up-to-date info: addresses, hostname, etc.
     */
    public async rediscoverDevices(dnssdInstances: string[], timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
        if (dnssdInstances.length === 0) {
            return [];
        }
        
        const rediscoveredDevices: DiscoveredDevice[] = [];

        const allDevices = await this.discoverService(NET_DNSSD_SERVICES.HPZGX, NET_PROTOCOLS.TCP, timeoutMs);
        for (const d of allDevices) {
            if (d.name && dnssdInstances.some(instance => instance.toLowerCase() === d.name.toLowerCase())) {
                rediscoveredDevices.push(d);
            }
        }

        return rediscoveredDevices;
    }

}

export const deviceDiscoveryService = new DeviceDiscoveryService({ telemetry: telemetryService });
