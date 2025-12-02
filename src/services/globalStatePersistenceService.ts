/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { Device } from '../types/devices';
import { deviceStore, DeviceStore } from '../store/deviceStore';
import { logger } from '../utils/logger';

/**
 * Configuration for the StorageService.
 */
export interface StorageServiceConfig {
    /** VS Code extension context for accessing global state */
    context: vscode.ExtensionContext;
    /** device store to persist */
    store: DeviceStore;
}

/**
 * Service for persisting device data to VS Code's global state.
 * Automatically saves devices when the store changes and loads them on initialization.
 * This subscribes to store updates and persists changes to the global state.
 * It should be disposed when no longer needed.
 */
export class GlobalStatePersistenceService {
    private static readonly LEGACY_STORAGE_KEYS = ['remoteDevices.devices'];
    private static readonly STORAGE_KEY = 'HPInc.zgx-toolkit.devices';
    private unsubscribe?: () => void;

    constructor(private config: StorageServiceConfig) { }

    /**
     * Initialize the storage service.
     * Loads devices from storage and sets up auto-save subscription.
     */
    public async initialize(): Promise<void> {
        logger.info('Initializing storage service');

        try {
            // Load devices from storage
            await this.loadDevices();

            // Subscribe to store changes for auto-save
            this.unsubscribe = this.config.store.subscribe(async (devices) => {
                await this.saveDevices(devices);
            });

            logger.info('Storage service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize storage service', { error });
            throw error;
        }
    }

    /**
     * Load devices from VS Code's global state into the store.
     */
    public async loadDevices(): Promise<void> {
        logger.debug('Loading devices from storage');

        try {
            let savedDevices = this.config.context.globalState.get<Device[]>(
                GlobalStatePersistenceService.STORAGE_KEY,
                []
            );
            if ((!savedDevices || savedDevices.length === 0) && GlobalStatePersistenceService.LEGACY_STORAGE_KEYS.length > 0) {
                // Check legacy keys for backward compatibility
                for (const key of GlobalStatePersistenceService.LEGACY_STORAGE_KEYS) {
                    const legacyDevices = this.config.context.globalState.get<Device[]>(key, []);
                    if (legacyDevices && legacyDevices.length > 0) {
                        logger.info('Found devices in legacy storage key, migrating', { key });
                        this.saveDevices(legacyDevices); // Migrate to new key
                        savedDevices = legacyDevices;
                        break;
                    }
                }
            }

            if (savedDevices.length > 0) {
                // Validate and load devices
                const validDevices = savedDevices.filter(device => this.validateDevice(device));

                if (validDevices.length < savedDevices.length) {
                    logger.warn('Some devices failed validation and were skipped', {
                        total: savedDevices.length,
                        valid: validDevices.length,
                        skipped: savedDevices.length - validDevices.length,
                    });
                }

                this.config.store.setMany(validDevices);
                logger.info('devices loaded from storage', { count: validDevices.length });
            } else {
                logger.debug('No devices found in storage');
            }
        } catch (error) {
            logger.error('Failed to load devices from storage', { error });
            // Don't throw - allow extension to continue with empty state
        }
    }

    /**
     * Save devices to VS Code's global state.
     * Called automatically when store changes.
     */
    private async saveDevices(devices: Device[]): Promise<void> {
        try {
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.STORAGE_KEY,
                devices
            );

            logger.trace('devices saved to storage', { count: devices.length });
        } catch (error) {
            logger.error('Failed to save devices to storage', { error });
            // Don't throw - allow extension to continue even if save fails
        }
    }

    /**
     * Manually trigger a save of all devices.
     * Useful for ensuring data is persisted at critical points.
     */
    public async forceSave(): Promise<void> {
        logger.debug('Forcing save of devices to storage');
        const devices = this.config.store.getAll();
        await this.saveDevices(devices);
    }

    /**
     * Clear all stored device data.
     * This will both clear the store and remove data from storage.
     */
    public async clearStorage(): Promise<void> {
        logger.info('Clearing all device data from storage');

        try {
            // Clear store
            this.config.store.clear();

            // Clear storage
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.STORAGE_KEY,
                undefined
            );

            logger.info('Storage cleared successfully');
        } catch (error) {
            logger.error('Failed to clear storage', { error });
            throw error;
        }
    }

    /**
     * Get the raw device data from storage without loading it into the store.
     * Useful for debugging or backup purposes.
     */
    public async getRawStorageData(): Promise<Device[]> {
        return this.config.context.globalState.get<Device[]>(
            GlobalStatePersistenceService.STORAGE_KEY,
            []
        );
    }

    /**
     * Export all devices as JSON for backup.
     */
    public exportToJSON(): string {
        const devices = this.config.store.getAll();
        return JSON.stringify(devices, null, 2);
    }

    /**
     * Import devices from JSON backup.
     * Replaces existing devices with the imported data.
     */
    public async importFromJSON(json: string): Promise<void> {
        logger.info('Importing devices from JSON');

        try {
            const devices: Device[] = JSON.parse(json);

            if (!Array.isArray(devices)) {
                throw new Error('Invalid JSON: expected an array of devices');
            }

            // Validate all devices
            const validDevices = devices.filter(device => this.validateDevice(device));

            if (validDevices.length < devices.length) {
                logger.warn('Some devices in import were invalid', {
                    total: devices.length,
                    valid: validDevices.length,
                });
            }

            // Clear and load new devices
            this.config.store.clear();
            this.config.store.setMany(validDevices);

            logger.info('devices imported successfully', { count: validDevices.length });
        } catch (error) {
            logger.error('Failed to import devices from JSON', { error });
            throw error;
        }
    }

    /**
     * Validate a device object to ensure it has required fields.
     * Returns true if valid, false otherwise.
     */
    private validateDevice(device: any): device is Device {
        if (!device || typeof device !== 'object') {
            return false;
        }

        // Check required fields
        const required = ['id', 'name', 'host', 'username', 'port'];
        for (const field of required) {
            if (!(field in device)) {
                logger.warn('device validation failed: missing required field', { field, id: device.id });
                return false;
            }
        }

        // Validate port range
        if (device.port < 1 || device.port > 65535) {
            logger.warn('device validation failed: invalid port', { port: device.port, id: device.id });
            return false;
        }

        return true;
    }

    /**
     * Clean up the storage service.
     * Unsubscribes from store changes.
     */
    public dispose(): void {
        logger.debug('Disposing storage service');

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = undefined;
        }
    }

    /**
     * Get storage statistics.
     */
    public async getStatistics(): Promise<{
        machineCount: number;
        storageSize: number;
        lastModified?: string;
    }> {
        const devices = await this.getRawStorageData();
        const json = JSON.stringify(devices);

        return {
            machineCount: devices.length,
            storageSize: Buffer.byteLength(json, 'utf8'),
        };
    }
}

/**
 * Create and initialize the storage service.
 * This should be called during extension activation.
 */
export async function createGlobalStatePersistenceService(
    context: vscode.ExtensionContext,
    store: DeviceStore
): Promise<GlobalStatePersistenceService> {
    const service = new GlobalStatePersistenceService({ context, store });
    await service.initialize();
    return service;
}