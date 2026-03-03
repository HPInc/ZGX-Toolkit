/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { Device } from '../types/devices';
import { ConnectXGroup } from '../types/connectxGroup';
import { DeviceStore } from '../store/deviceStore';
import { GroupStore } from '../store/groupStore';
import { logger } from '../utils/logger';

/**
 * Configuration for the StorageService.
 */
export interface StorageServiceConfig {
    /** VS Code extension context for accessing global state */
    context: vscode.ExtensionContext;
    /** device store to persist */
    deviceStore: DeviceStore;
    /** group store to persist */
    groupStore: GroupStore;
}

/**
 * Service for persisting device and group data to VS Code's global state.
 * Automatically saves devices and groups when the store changes and loads them on initialization.
 * This subscribes to store updates and persists changes to the global state.
 * It should be disposed when no longer needed.
 */
export class GlobalStatePersistenceService {
    private static readonly LEGACY_STORAGE_KEYS = ['remoteDevices.devices'];
    private static readonly DEVICES_STORAGE_KEY = 'HPInc.zgx-toolkit.devices';
    private static readonly GROUPS_STORAGE_KEY = 'HPInc.zgx-toolkit.groups';
    private deviceUnsubscribe?: () => void;
    private groupUnsubscribe?: () => void;

    constructor(private config: StorageServiceConfig) { }

    /**
     * Initialize the storage service.
     * Loads devices and groups from storage and sets up auto-save subscription.
     */
    public async initialize(): Promise<void> {
        logger.info('Initializing storage service');

        try {
            // Load devices and groups from storage
            await this.loadDevices();
            await this.loadGroups();

            // Subscribe to store changes for auto-save
            this.deviceUnsubscribe = this.config.deviceStore.subscribe(async (devices) => {
                await this.saveDevices(devices);
            });

            this.groupUnsubscribe = this.config.groupStore.subscribe(async (groups) => {
                await this.saveGroups(groups);
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
                GlobalStatePersistenceService.DEVICES_STORAGE_KEY,
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

                this.config.deviceStore.setMany(validDevices);
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
     * Load groups from VS Code's global state into the store.
     */
    public async loadGroups(): Promise<void> {
        logger.debug('Loading groups from storage');

        try {
            const savedGroups = this.config.context.globalState.get<ConnectXGroup[]>(
                GlobalStatePersistenceService.GROUPS_STORAGE_KEY,
                []
            );

            if (savedGroups.length === 0) {
                logger.debug('No groups found in storage');
                return;
            }

            const { validGroups, skippedCount } = this.filterValidGroups(savedGroups);

            if (skippedCount > 0) {
                logger.warn('Some groups failed validation and were skipped', {
                    total: savedGroups.length,
                    valid: validGroups.length,
                    skipped: skippedCount,
                });
            }

            this.config.groupStore.setMany(validGroups);
            logger.info('Groups loaded from storage', { count: validGroups.length });
        } catch (error) {
            logger.error('Failed to load groups from storage', { error });
            // Don't throw - allow extension to continue with empty state
        }
    }

    /**
     * Filter and validate groups, ensuring all device references exist.
     */
    private filterValidGroups(savedGroups: ConnectXGroup[]): { validGroups: ConnectXGroup[]; skippedCount: number } {
        const validGroups: ConnectXGroup[] = [];
        let skippedCount = 0;

        for (const group of savedGroups) {
            const processedGroup = this.processGroup(group);
            
            if (processedGroup) {
                validGroups.push(processedGroup);
            } else {
                skippedCount++;
            }
        }

        return { validGroups, skippedCount };
    }

    /**
     * Process a single group: validate structure and filter device references.
     * Returns the processed group or undefined if invalid.
     */
    private processGroup(group: ConnectXGroup): ConnectXGroup | undefined {
        // Check basic structure
        if (!this.validateGroup(group)) {
            return undefined;
        }

        // Verify all devices exist in the device store
        const validDeviceIds = group.deviceIds.filter(deviceId => 
            this.config.deviceStore.get(deviceId) !== undefined
        );

        // Only load groups with at least 2 valid devices
        if (validDeviceIds.length < 2) {
            logger.info('Group skipped: insufficient valid devices', {
                groupId: group.id,
                originalDeviceCount: group.deviceIds.length,
                validDeviceCount: validDeviceIds.length
            });
            return undefined;
        }

        // Update group if some devices were filtered out
        if (validDeviceIds.length < group.deviceIds.length) {
            logger.info('Group loaded with filtered device references', {
                groupId: group.id,
                originalDeviceCount: group.deviceIds.length,
                validDeviceCount: validDeviceIds.length
            });
            return {
                ...group,
                deviceIds: validDeviceIds,
                updatedAt: new Date().toISOString()
            };
        }

        return group;
    }

    /**
     * Save devices to VS Code's global state.
     * Called automatically when store changes.
     */
    private async saveDevices(devices: Device[]): Promise<void> {
        try {
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.DEVICES_STORAGE_KEY,
                devices
            );

            logger.trace('devices saved to storage', { count: devices.length });
        } catch (error) {
            logger.error('Failed to save devices to storage', { error });
            // Don't throw - allow extension to continue even if save fails
        }
    }

    /**
     * Save groups to VS Code's global state.
     * Called automatically when store changes.
     */
    private async saveGroups(groups: ConnectXGroup[]): Promise<void> {
        try {
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.GROUPS_STORAGE_KEY,
                groups
            );

            logger.trace('Groups saved to storage', { count: groups.length });
        } catch (error) {
            logger.error('Failed to save groups to storage', { error });
            // Don't throw - allow extension to continue even if save fails
        }
    }

    /**
     * Manually trigger a save of all devices and groups.
     * Useful for ensuring data is persisted at critical points.
     */
    public async forceSave(): Promise<void> {
        logger.debug('Forcing save of devices and groups to storage');
        const devices = this.config.deviceStore.getAll();
        const groups = this.config.groupStore.getAll();
        await this.saveDevices(devices);
        await this.saveGroups(groups);
    }

    /**
     * Clear all stored device and group data.
     * This will both clear the stores and remove data from storage.
     */
    public async clearStorage(): Promise<void> {
        logger.info('Clearing all device and group data from storage');

        try {
            // Clear stores
            this.config.deviceStore.clear();
            this.config.groupStore.clear();

            // Clear storage
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.DEVICES_STORAGE_KEY,
                undefined
            );
            await this.config.context.globalState.update(
                GlobalStatePersistenceService.GROUPS_STORAGE_KEY,
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
    public async getRawDeviceData(): Promise<Device[]> {
        return this.config.context.globalState.get<Device[]>(
            GlobalStatePersistenceService.DEVICES_STORAGE_KEY,
            []
        );
    }

    /**
     * Get the raw group data from storage without loading it into the store.
     * Useful for debugging or backup purposes.
     */
    public async getRawGroupData(): Promise<ConnectXGroup[]> {
        return this.config.context.globalState.get<ConnectXGroup[]>(
            GlobalStatePersistenceService.GROUPS_STORAGE_KEY,
            []
        );
    }

    /**
     * Export all devices as JSON for backup.
     */
    public exportToJSON(): string {
        const devices = this.config.deviceStore.getAll();
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
            this.config.deviceStore.clear();
            this.config.deviceStore.setMany(validDevices);

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
     * Validate a group object has the required fields.
     */
    private validateGroup(group: any): boolean {
        if (!group || typeof group !== 'object') {
            logger.warn('Invalid group: not an object', { group });
            return false;
        }

        const requiredFields = ['id', 'deviceIds', 'createdAt', 'updatedAt'];
        for (const field of requiredFields) {
            if (!(field in group)) {
                logger.warn('Invalid group: missing required field', { field, group });
                return false;
            }
        }

        if (!Array.isArray(group.deviceIds)) {
            logger.warn('Invalid group: deviceIds is not an array', { group });
            return false;
        }

        return true;
    }

    /**
     * Dispose of the storage service.
     * Unsubscribes from store changes.
     */
    public dispose(): void {
        logger.debug('Disposing storage service');

        if (this.deviceUnsubscribe) {
            this.deviceUnsubscribe();
            this.deviceUnsubscribe = undefined;
        }

        if (this.groupUnsubscribe) {
            this.groupUnsubscribe();
            this.groupUnsubscribe = undefined;
        }
    }

    /**
     * Get storage statistics.
     */
    public async getStatistics(): Promise<{
        machineCount: number;
        groupCount: number;
        storageSize: number;
        lastModified?: string;
    }> {
        const devices = await this.getRawDeviceData();
        const groups = await this.getRawGroupData();
        const json = JSON.stringify({ devices, groups });

        return {
            machineCount: devices.length,
            groupCount: groups.length,
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
    deviceStore: DeviceStore,
    groupStore: GroupStore
): Promise<GlobalStatePersistenceService> {
    const service = new GlobalStatePersistenceService({ context, deviceStore, groupStore });
    await service.initialize();
    return service;
}
