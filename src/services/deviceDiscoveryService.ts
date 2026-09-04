/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as dnssd from 'dnssd';
import * as os from 'node:os';
import * as net from 'node:net';
import { logger } from '../utils/logger';
import { NET_PROTOCOLS, NET_DNSSD_SERVICES, NetProtocol } from '../constants/net';
import { DiscoveredDevice } from '../types/devices';
import { ITelemetryService, TelemetryEventType } from '../types/telemetry';
import { telemetryService } from './telemetryService';

export type DeviceDiscoveryFailureReason = 'timeout' | 'permission' | 'service' | 'network' | 'unknown';

export class DeviceDiscoveryError extends Error {
    public readonly reason: DeviceDiscoveryFailureReason;

    constructor(reason: DeviceDiscoveryFailureReason, message: string) {
        super(message);
        this.name = 'DeviceDiscoveryError';
        this.reason = reason;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

const DEVICE_DISCOVERY_FAILURE_PRIORITY: Record<DeviceDiscoveryFailureReason, number> = {
    permission: 0,
    service: 1,
    network: 2,
    timeout: 3,
    unknown: 4
};

const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;
const trackedDiscoveryErrors = new WeakSet<DeviceDiscoveryError>();

interface DiscoverySessionResult {
    devices: DiscoveredDevice[];
    errors: DeviceDiscoveryError[];
    hadSuccessfulPath: boolean;
}

interface DiscoveryBrowserState {
    hadError: boolean;
}

function normalizeDiscoveryErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return '';
}

export function classifyDeviceDiscoveryFailureReason(message: string): DeviceDiscoveryFailureReason {
    if (/(timed out|timeout)/i.test(message)) {
        return 'timeout';
    }

    if (/(eacces|access is denied|operation not permitted|permission denied)/i.test(message)) {
        return 'permission';
    }

    if (/(bonjour|dnssd|mdns|resolver|browse failed|service unavailable)/i.test(message)) {
        return 'service';
    }

    if (/(ehostunreach|enetunreach|enotfound|no route to host|network is unreachable|socket error|interface)/i.test(message)) {
        return 'network';
    }

    return 'unknown';
}

function toDeviceDiscoveryError(error: unknown, fallbackMessage: string): DeviceDiscoveryError {
    if (error instanceof DeviceDiscoveryError) {
        return error;
    }

    const message = normalizeDiscoveryErrorMessage(error) || fallbackMessage;
    return new DeviceDiscoveryError(classifyDeviceDiscoveryFailureReason(message), message);
}

function getPreferredDeviceDiscoveryError(errors: DeviceDiscoveryError[]): DeviceDiscoveryError {
    return [...errors].sort((left, right) =>
        DEVICE_DISCOVERY_FAILURE_PRIORITY[left.reason] - DEVICE_DISCOVERY_FAILURE_PRIORITY[right.reason]
    )[0];
}

function normalizeDiscoveryTimeoutMs(timeoutMs: number = DEFAULT_DISCOVERY_TIMEOUT_MS): number {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        logger.warn('Invalid discovery timeout provided, using default timeout', {
            timeoutMs,
            defaultTimeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS
        });
        return DEFAULT_DISCOVERY_TIMEOUT_MS;
    }

    return timeoutMs;
}

/**
 * Configuration options for DeviceDiscoveryService
 */
export interface DeviceDiscoveryServiceConfig {
    telemetry: ITelemetryService;
};

export class DeviceDiscoveryService {
    private readonly config: DeviceDiscoveryServiceConfig;
    
    private static readonly ZGX_HOSTNAME_PATTERNS = [
        /^zgx-[A-Za-z0-9]{6}$/,     // HP Factory Pattern (6 character): zgx-XXXXXX
        /^zgx-[A-Za-z0-9]{4}$/,     // HP Factory Pattern (4 character): zgx-XXXX
        /^spark-[A-Za-z0-9]{4}$/    // NVIDIA Default Pattern: spark-XXXX
    ];

    constructor(config: DeviceDiscoveryServiceConfig) {
        this.config = config;
    }

    private trackDiscoveryError(error: DeviceDiscoveryError): void {
        if (trackedDiscoveryErrors.has(error)) {
            return;
        }

        trackedDiscoveryErrors.add(error);
        this.config.telemetry.trackError({
            eventType: TelemetryEventType.Error,
            error,
            context: 'device-discovery'
        });
    }

    /**
     * Gets all active network interfaces with IPv4 addresses
     * @returns Array of network interface addresses
     */
    private getNetworkInterfaces(): string[] {
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];

        for (const netInterfaces of Object.values(interfaces)) {
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
     * @throws DeviceDiscoveryError when discovery cannot be performed
     */
    public async discoverService(serviceType: string, proto: NetProtocol, timeoutMs = 5000): Promise<DiscoveredDevice[]> {
        const result = await this.runDiscoverySession(serviceType, proto, timeoutMs);
        if (result.devices.length === 0 && !result.hadSuccessfulPath && result.errors.length > 0) {
            const preferredError = getPreferredDeviceDiscoveryError(result.errors);
            this.trackDiscoveryError(preferredError);
            throw preferredError;
        }

        return result.devices;
    }

    private async runDiscoverySession(serviceType: string, proto: NetProtocol, timeoutMs = 5000): Promise<DiscoverySessionResult> {
        return new Promise((resolve, reject) => {
            const resolvedTimeoutMs = normalizeDiscoveryTimeoutMs(timeoutMs);

            const discoveredDevices = new Map<string, DiscoveredDevice>();
            const browsers: dnssd.Browser[] = [];
            const browserStates: DiscoveryBrowserState[] = [];
            const browserErrors: DeviceDiscoveryError[] = [];
            let isSettled = false;

            // Clean up function to close all browsers
            const cleanUp = (browsers: dnssd.Browser[]) => {
                browsers.forEach(browser => {
                    if (browser && typeof browser.stop === 'function') {
                        browser.stop();
                    }
                });
            };

            const resolveDiscovery = (result: DiscoverySessionResult) => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                cleanUp(browsers);
                resolve(result);
            };

            const rejectDiscovery = (error: DeviceDiscoveryError) => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                cleanUp(browsers);
                this.trackDiscoveryError(error);
                reject(error);
            };

            const networkAddresses = this.getNetworkInterfaces();

            logger.info('Starting device discovery on all network interfaces...');

            try {
                if (networkAddresses.length === 0) {
                    const error = new DeviceDiscoveryError('network', 'No active network interfaces found');
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
                    rejectDiscovery(error);
                    return;
                }

                for (const addr of networkAddresses) {
                    try {
                        const st: dnssd.ServiceType = proto === NET_PROTOCOLS.TCP
                            ? dnssd.tcp(serviceType)
                            : dnssd.udp(serviceType);

                        const browser = new dnssd.Browser(st, { interface: addr, resolve: true });
                        const browserState: DiscoveryBrowserState = { hadError: false };

                        browser.on('serviceUp', (service: dnssd.Service) => {
                            const parts = service.host.split('.local');
                            const hostname = parts[0] || '';
                            const ipv4Addresses = service.addresses.filter(addr => net.isIPv4(addr));
                            discoveredDevices.set(hostname, {
                                name: service.name,
                                hostname: hostname,
                                addresses: ipv4Addresses,
                                port: service.port,
                                protocol: proto
                            });
                        });

                        browser.on('error', (error: unknown) => {
                            const discoveryError = toDeviceDiscoveryError(error, `mDNS discovery failed on interface ${addr}`);
                            logger.error(`mDNS discovery failed on interface ${addr}: ${discoveryError.message}`);
                            browserState.hadError = true;
                            browserErrors.push(discoveryError);
                        });

                        browsers.push(browser);
                        browserStates.push(browserState);
                    } catch (error) {
                        const discoveryError = toDeviceDiscoveryError(error, `Failed to create browser for interface ${addr}`);
                        logger.error(`Failed to create browser for interface ${addr}: ${discoveryError.message}`);
                        browserErrors.push(discoveryError);
                        continue;
                    }
                }

                if (browsers.length === 0) {
                    rejectDiscovery(getPreferredDeviceDiscoveryError(browserErrors));
                    return;
                }

                // Start discovery on all browsers
                browsers.forEach(browser => browser.start());
                logger.info(`mDNS discovery started on ${browsers.length} interface(s)`);

                // Stop discovery after timeout
                setTimeout(() => {
                    if (isSettled) {
                        return;
                    }

                    logger.info(`Discovery finished after ${resolvedTimeoutMs}ms`);
                    const hadHealthyBrowser = browserStates.some(browserState => !browserState.hadError);
                    resolveDiscovery({
                        devices: Array.from(discoveredDevices.values()),
                        errors: browserErrors,
                        hadSuccessfulPath: discoveredDevices.size > 0 || hadHealthyBrowser
                    });
                }, resolvedTimeoutMs);
            } catch (error) {
                const discoveryError = toDeviceDiscoveryError(error, 'mDNS discovery failed');
                logger.error(`mDNS discovery failed: ${discoveryError.message}`);
                rejectDiscovery(discoveryError);
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
     * @throws DeviceDiscoveryError when discovery cannot be performed and no devices were found
     */
    public async discoverDevices(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
        const zgxDevices = new Map<string, DiscoveredDevice>();

        // Run both discovery operations in parallel
        const results = await Promise.allSettled([
            this.runDiscoverySession(NET_DNSSD_SERVICES.SSH, NET_PROTOCOLS.TCP, timeoutMs),
            this.runDiscoverySession(NET_DNSSD_SERVICES.HPZGX, NET_PROTOCOLS.TCP, timeoutMs)
        ]);
        const discoveryErrors: DeviceDiscoveryError[] = [];
        let hadAnySuccessfulPath = false;

        // Process SSH devices (if successful)
        if (results[0].status === 'fulfilled') {
            hadAnySuccessfulPath = hadAnySuccessfulPath || results[0].value.hadSuccessfulPath || results[0].value.devices.length > 0;
            for (const sshDevice of results[0].value.devices) {
                this.recordDeviceIfZGXHostname(sshDevice, zgxDevices);
            }
            discoveryErrors.push(...results[0].value.errors);
        } else {
            discoveryErrors.push(toDeviceDiscoveryError(results[0].reason, 'SSH discovery failed'));
        }
        
        // Process HPZGX devices (if successful)
        // These are assumed to be ZGX devices because they advertise the _hpzgx service.
        // It is possible for a ZGX to advertise both _ssh and _hpzgx services. To avoid
        // duplicates, we overwrite an existing entry with the _hpzgx version.
        if (results[1].status === 'fulfilled') {
            hadAnySuccessfulPath = hadAnySuccessfulPath || results[1].value.hadSuccessfulPath || results[1].value.devices.length > 0;
            for (const hpzgxDevice of results[1].value.devices) {
                zgxDevices.set(hpzgxDevice.hostname, hpzgxDevice);
            }
            discoveryErrors.push(...results[1].value.errors);
        } else {
            discoveryErrors.push(toDeviceDiscoveryError(results[1].reason, 'HPZGX discovery failed'));
        }

        if (zgxDevices.size === 0 && !hadAnySuccessfulPath && discoveryErrors.length > 0) {
            const preferredError = getPreferredDeviceDiscoveryError(discoveryErrors);
            this.trackDiscoveryError(preferredError);
            throw preferredError;
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
     * @throws DeviceDiscoveryError when rediscovery cannot be performed
     */
    public async rediscoverDevices(dnssdInstances: string[], timeoutMs = 5000): Promise<DiscoveredDevice[]> {
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
