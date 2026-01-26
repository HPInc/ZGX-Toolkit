/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device service for ZGX Toolkit extension.
 * Provides business logic for device CRUD operations, validation, and discovery.
 * 
 * This is a clean, modern implementation built from scratch for the rewrite.
 */

import * as net from 'net';
import ReadWriteLock from 'rwlock';
import { Device, DeviceConfig } from '../types/devices';
import { deviceStore, DeviceStore } from '../store/deviceStore';
import { logger } from '../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../types/telemetry';
import { telemetryService } from './telemetryService';
import { deviceDiscoveryService, DeviceDiscoveryService } from './deviceDiscoveryService';
import { BACKGROUND_UPDATER_INTERVAL, MILLISECONDS_PER_MINUTE } from '../constants/time';

/**
 * Configuration for the DeviceService.
 */
export interface DeviceServiceConfig {
    store: DeviceStore;
    telemetry: ITelemetryService;
    discovery: DeviceDiscoveryService;
}

/**
 * Service for managing device operations.
 * Handles creation, updates, deletion, and discovery of ZGX devices.
 */
export class DeviceService {
    private config: DeviceServiceConfig;
    private backgroundUpdaterInterval?: NodeJS.Timeout;
    private readonly storeLock: ReadWriteLock = new ReadWriteLock();

    constructor(config: DeviceServiceConfig) {
        this.config = config;
    }

    /**
     * Create a new device from configuration.
     * Validates the configuration, creates the device object, and saves it to the store.
     * 
     * @param deviceConfig Configuration for the new device
     * @returns Promise resolving to the created device
     * @throws Error if configuration is invalid
     */
    public async createDevice(deviceConfig: DeviceConfig): Promise<Device> {
        logger.info('Creating device', { name: deviceConfig.name, host: deviceConfig.host });

        return new Promise<Device>((resolve, reject) => {
            this.storeLock.writeLock((release) => {
                try {
                    // Validate configuration
                    this.validateDeviceConfig(deviceConfig);

                    // Create device with full data
                    const device: Device = {
                        id: this.generateId(),
                        name: deviceConfig.name,
                        host: deviceConfig.host,
                        username: deviceConfig.username,
                        port: deviceConfig.port,
                        isSetup: false,
                        useKeyAuth: deviceConfig.useKeyAuth,
                        keySetup: {
                            keyGenerated: false,
                            keyCopied: false,
                            connectionTested: false,
                        },
                        createdAt: new Date().toISOString(),
                    };

                    // Save to store
                    this.config.store.set(device.id, device);

                    logger.debug('device created successfully', { id: device.id, name: device.name });
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'create',
                    });

                    resolve(device);
                } catch (error) {
                    logger.error('Failed to create device', { error, config: deviceConfig });
                    this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.create' });
                    reject(error instanceof Error ? error : new Error(String(error)));
                } finally {
                    release();
                }
            });
        });
    }

    /**
     * Update an existing device with partial data.
     * 
     * @param id device identifier
     * @param updates Partial device data to merge
     * @returns Promise resolving when update is complete
     * @throws Error if device is not found
     */
    public async updateDevice(id: string, updates: Partial<Device>): Promise<void> {
        logger.info('Updating device', { id, updates: Object.keys(updates) });
        
        return new Promise<void>((resolve, reject) => {
            this.storeLock.writeLock((release) => {
                try {
                    const device = this.config.store.get(id);
                    
                    if (!device) {
                        const msg = `device not found for update: ${id}`;
                        logger.error(msg);
                        reject(new Error(msg));
                        return;
                    }

                    // Update in store
                    const success = this.config.store.update(id, updates);
                    
                    if (!success) {
                        reject(new Error(`Failed to update device: ${id}`));
                        return;
                    }

                    logger.debug('device updated successfully', { id, updates: Object.keys(updates) });
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'update'
                    });
                    
                    resolve();
                } catch (error) {
                    logger.error('Failed to update device', { error, id });
                    this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.update' });
                    reject(new Error(`Failed to update device ${id}: ${error instanceof Error ? error.message : String(error)}`));
                } finally {
                    release();
                }
            });
        });
    }

    /**
     * Delete a device from the system.
     * 
     * @param id device identifier
     * @returns Promise resolving when deletion is complete
     * @throws Error if device is not found
     */
    public async deleteDevice(id: string): Promise<void> {
        logger.info('Deleting device', { id });
        
        return new Promise<void>((resolve, reject) => {
            this.storeLock.writeLock((release) => {
                try {
                    const device = this.config.store.get(id);
                    
                    if (!device) {
                        const msg = `device not found for deletion: ${id}`;
                        logger.error(msg);
                        reject(new Error(msg));
                        return;
                    }

                    // Delete from store
                    const success = this.config.store.delete(id);
                    
                    if (!success) {
                        reject(new Error(`Failed to delete device: ${id}`));
                        return;
                    }

                    logger.debug('device deleted successfully', { id, name: device.name });
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'delete'
                    });
                    
                    resolve();
                } catch (error) {
                    logger.error('Failed to delete device', { error, id });
                    this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.delete' });
                    reject(new Error(`Failed to delete device ${id}: ${error instanceof Error ? error.message : String(error)}`));
                } finally {
                    release();
                }
            });
        });
    }

    /**
     * Get a device by ID.
     * 
     * @param id device identifier
     * @returns The device or undefined if not found
     */
    public async getDevice(id: string): Promise<Device | undefined> {
        return new Promise<Device | undefined>((resolve) => {
            this.storeLock.readLock((release) => {
                const device = this.config.store.get(id);
                release();
                resolve(device);
            });
        });
    }

    /**
     * Get all devices.
     * 
     * @returns Array of all devices
     */
    public async getAllDevices(): Promise<Device[]> {
        return new Promise<Device[]>((resolve) => {
            this.storeLock.readLock((release) => {
                const devices = this.config.store.getAll();
                release();
                resolve(devices);
            });
        });
    }

    /**
     * Subscribe to device store changes.
     * 
     * @param listener Callback function to invoke when devices change
     * @returns Unsubscribe function to stop receiving updates
     */
    public subscribe(listener: () => void): () => void {
        return this.config.store.subscribe(listener);
    }

    /**
     * Validate device configuration before creation.
     * 
     * @param config device configuration to validate
     * @throws Error if configuration is invalid
     */
    private validateDeviceConfig(config: DeviceConfig): void {
        const errors: string[] = [];

        if (!config.name || config.name.trim().length === 0) {
            errors.push('invalid device name');
        }

        if (!config.host || this.validateHost(config.host) === false) {
            errors.push('invalid device host');
        }

        if (!config.username || this.validateUsername(config.username) === false) {
            errors.push('invalid username');
        }

        if (!config.port || this.validatePort(config.port) === false) {
            errors.push('invalid port number (must be between 1 and 65535)');
        }

        if (errors.length > 0) {
            const errorMessage = `Invalid device configuration: ${errors.join(', ')}`;
            logger.warn('device configuration validation failed', { errors });
            throw new Error(errorMessage);
        }

        // Check for duplicate names
        const existing = this.config.store.getAll().find(d => d.name === config.name);
        if (existing) {
            const error = `A device with the name "${config.name}" already exists`;
            logger.warn('Duplicate device name', { name: config.name });
            throw new Error(error);
        }
    }

    /**
     * Generate a unique ID for a new device.
     * Uses timestamp and random string for uniqueness.
     * 
     * @returns Unique device identifier
     */
    private generateId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 11);
        return `device-${timestamp}-${random}`;
    }

    /**
     * Connect to a device via Remote-SSH.
     * device should already be set up before calling this method.
     * If device is not set up, throws a DeviceNeedsSetupError.
     * 
     * @param id device identifier
     * @param newWindow Whether to open in a new window (optional)
     * @returns Promise resolving when connection is initiated
     * @throws DeviceNeedsSetupError if device requires setup
     * @throws Error if device is not found
     */
    public async connectToDevice(id: string, newWindow?: boolean): Promise<void> {
        logger.info('Attempting to connect to device', { id, newWindow });

        try {
            const device = await this.getDevice(id);
            
            if (!device) {
                const error = new Error(`device not found: ${id}`);
                logger.error('device not found for connection', { id });
                throw error;
            }

            // Check if device needs setup
            // Note: The UI should prevent calling this for non-setup devices,
            // but we still check here as a safety measure
            if (!device.isSetup) {
                logger.warn('Attempted to connect to device that requires setup', { 
                    id, 
                    name: device.name 
                });
                
                const error = new DeviceNeedsSetupError(
                    `device "${device.name}" requires SSH setup before connecting`,
                    device
                );
                throw error;
            }

            // device is setup, connect via ConnectionService
            logger.debug('device is setup, initiating connection', { id, name: device.name });
            
            // Import ConnectionService here to avoid circular dependencies
            const { connectionService } = await import('./connectionService');
            
            // Update device preference if specified
            if (newWindow !== undefined) {
                await this.updateDevice(id, { lastConnectionMethod: newWindow });
            }
            
            // Connect via Remote-SSH
            await connectionService.connectViaRemoteSSH(device, newWindow);
            
            logger.info('Connection initiated successfully', { id, name: device.name });
            this.config.telemetry.trackEvent({
                eventType: TelemetryEventType.Device,
                action: 'connect',
                properties: {
                    newWindow: String(newWindow),
                }
            });
            
        } catch (error) {
            // Re-throw DeviceNeedsSetupError as-is so views can handle it
            if (error instanceof DeviceNeedsSetupError) {
                throw error;
            }
            
            logger.error('Failed to connect to device', { error, id });
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.connect' });
            throw error;
        }
    }

    /**
     * Validates username to prevent SSH injection attacks.
     * Allows alphanumeric characters, dash, underscore, period, backslash, and @.
     * Disallows spaces and leading "..".
     */
    private validateUsername(username: string): boolean {
        if (!username || typeof username !== 'string') {
            return false;
        }
        
        // Disallow spaces
        if (/\s/.test(username)) {
            return false;
        }
        
        // Disallow leading ".."
        if (username.startsWith('..')) {
            return false;
        }
        
        // Allow alphanumeric, dash, underscore, period, backslash, and @
        // Note: @ is valid in usernames but will be escaped when used in SSH commands
        return /^[a-zA-Z0-9._\-\\@]+$/.test(username);
    }

    /**
     * Validates hostname/IP address to prevent injection attacks.
     * Allows valid hostnames, IPv4, and IPv6 addresses.
     */
    private validateHost(host: string): boolean {
        if (!host || typeof host !== 'string') {
            return false;
        }
        
        // Remove leading/trailing whitespace
        host = host.trim();
        
        // Check for empty or too long hostname
        if (host.length === 0 || host.length > 253) {
            return false;
        }
        
        // Check if it's a valid IPv4 address using Node.js built-in function
        if (net.isIPv4(host)) {
            return true;
        }
        
        // Check if it's a valid IPv6 address using Node.js built-in function
        if (net.isIPv6(host)) {
            return true;
        }
        
        // Valid hostname pattern (RFC 1123)
        const hostnameRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        
        // Check if it matches valid hostname pattern
        if (hostnameRegex.test(host)) {
            return true;
        }
        
        return false;
    }

    /**
     * Validates SSH port number.
     */
    private validatePort(port: number): boolean {
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }

    /**
     * Start background updater that periodically rediscovers devices and updates their IP addresses.
     * Runs at the specified interval and updates devices whose host is an IPv4 address and are setup.
     * Only one background updater can be active at a time.
     * 
     * @param intervalMs The interval in milliseconds between updates (default: 10 minutes)
     * @returns void
     */
    public async startBackgroundUpdater(intervalMs: number = BACKGROUND_UPDATER_INTERVAL): Promise<void> {
        if (this.backgroundUpdaterInterval) {
            logger.debug('Background updater: Already running, skipping start');
            return;
        }

        logger.info(`Starting background device updater (${intervalMs / MILLISECONDS_PER_MINUTE} minute interval)`);

        const performUpdate = async () => {
            try {
                logger.debug('Background updater: Starting device rediscovery');

                // Get all devices that are setup, have a DNS instance name, and whose host is an IPv4 address.
                const devices = (await this.getAllDevices()).filter(device => 
                    device.isSetup && 
                    device.dnsInstanceName !== undefined &&
                    device.dnsInstanceName !== null &&
                    device.dnsInstanceName.trim().length > 0 &&
                    net.isIPv4(device.host)
                );

                if (devices.length === 0) {
                    return;
                }

                logger.debug(`Background updater: Found ${devices.length} devices to rediscover`);

                // Use dnsInstanceName for rediscovery instead of device name
                const discovered = await this.config.discovery.rediscoverDevices(
                    devices.map(d => d.dnsInstanceName!)
                );

                logger.debug(`Background updater: Rediscovered ${discovered.length} devices`);

                let updatedCount = 0;
                for (const d of discovered) {
                    // Match by dnsInstanceName (case-insensitive)
                    const originalDevice = devices.find(dev => 
                        dev.dnsInstanceName!.toLowerCase() === d.name.toLowerCase()
                    );
                    
                    if (originalDevice && d.addresses.length > 0) {
                        // Check if current host is in the discovered addresses
                        if (!d.addresses.includes(originalDevice.host)) {
                            logger.info('Background updater: Updating device host via discovery', {
                                name: originalDevice.name,
                                dnsInstanceName: originalDevice.dnsInstanceName,
                                oldHost: originalDevice.host,
                                newHost: d.addresses[0]
                            });
                            await this.updateDevice(originalDevice.id, { host: d.addresses[0] });
                            updatedCount++;
                        }
                    }
                }

                if (updatedCount > 0) {
                    logger.info(`Background updater: Updated ${updatedCount} device(s) with new IP addresses`);
                    this.config.telemetry.trackEvent({
                        eventType: TelemetryEventType.Device,
                        action: 'rediscover',
                        properties: {
                            method: 'dns-sd',
                            result: 'success',
                            source: 'background-updater'
                        },
                        measurements: {
                            deviceCount: updatedCount
                        }
                    });
                } else {
                    logger.debug('Background updater: No IP address changes detected');
                }
            } catch (error) {
                logger.error('Background updater: Failed to rediscover devices', { error });
                this.config.telemetry.trackError({
                    eventType: TelemetryEventType.Error,
                    error: error as Error,
                    context: 'background-updater'
                });
            }
        };

        // Run immediately on start
        await performUpdate();

        // Set up interval using the provided intervalMs parameter
        this.backgroundUpdaterInterval = setInterval(() => {
            performUpdate().catch(error => {
                logger.error('Background updater: Scheduled update failed', { error });
            });
        }, intervalMs);

        logger.debug(`Background updater: Interval scheduled for every ${intervalMs / MILLISECONDS_PER_MINUTE} minutes`);
    }

    /**
     * Stop the background updater if it's running.
     * 
     * @returns void
     */
    public stopBackgroundUpdater(): void {
        if (this.backgroundUpdaterInterval) {
            clearInterval(this.backgroundUpdaterInterval);
            this.backgroundUpdaterInterval = undefined;
            logger.info('Background updater: Stopped');
        } else {
            logger.debug('Background updater: No active updater to stop');
        }
    }


}

/**
 * Custom error thrown when a device needs setup before connecting.
 * Views can catch this error and navigate to the setup flow.
 */
export class DeviceNeedsSetupError extends Error {
    public readonly device: Device;
    public readonly requiresSetup = true;

    constructor(message: string, device: Device) {
        super(message);
        this.name = 'DeviceNeedsSetupError';
        this.device = device;
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DeviceNeedsSetupError);
        }
    }
}

/**
 * Singleton device service instance for use throughout the extension.
 * Initialized with the global device store.
 */
export const deviceService = new DeviceService({
    store: deviceStore,
    telemetry: telemetryService,
    discovery: deviceDiscoveryService,
});
