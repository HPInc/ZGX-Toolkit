/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device state management store for the ZGX Toolkit extension.
 * Implements observable pattern for reactive state management.
 * 
 * This is a clean, modern implementation built from scratch for the rewrite.
 */

import { Device } from '../types/devices';
import { IDeviceStore, StoreListener, Unsubscribe } from '../types/store';
import { logger } from '../utils/logger';

/**
 * DeviceStore provides centralized state management for device data.
 * Uses the observable pattern to notify subscribers of state changes.
 * 
 * This store is thread-safe and provides type-safe operations for managing devices.
 */
export class DeviceStore implements IDeviceStore {
  private devices = new Map<string, Device>();
  private listeners = new Set<StoreListener<Device[]>>();

  /**
   * Get a device by its unique identifier.
   * 
   * @param id The device identifier
   * @returns The device object or undefined if not found
   */
  public get(id: string): Device | undefined {
    return this.devices.get(id);
  }

  /**
   * Get all devices as an array.
   * Returns a new array to prevent external mutations.
   * 
   * @returns Array of all devices
   */
  public getAll(): Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get the current state (alias for getAll).
   * Implements IStore interface.
   * 
   * @returns Array of all devices
   */
  public getState(): Device[] {
    return this.getAll();
  }

  /**
   * Add or replace a device in the store.
   * If a device with the same ID exists, it will be replaced.
   * Notifies all subscribers of the change.
   * 
   * @param id The device identifier
   * @param device The device object to store
   */
  public set(id: string, device: Device): void {
    const isUpdate = this.devices.has(id);
    this.devices.set(id, device);
    
    logger.debug(`device ${isUpdate ? 'updated' : 'added'} to store`, { id, name: device.name });
    this.notify();
  }

  /**
   * Update an existing device with partial data.
   * Merges the updates with the existing device data.
   * 
   * @param id The device identifier
   * @param updates Partial device data to merge
   * @returns True if the device was updated, false if not found
   */
  public update(id: string, updates: Partial<Device>): boolean {
    const device = this.devices.get(id);
    
    if (!device) {
      logger.warn('Attempted to update non-existent device', { id });
      return false;
    }

    // Merge updates with existing device
    const updatedDevice: Device = {
      ...device,
      ...updates,
      // Always update the timestamp
      updatedAt: new Date().toISOString(),
    };

    this.devices.set(id, updatedDevice);
    logger.debug('device updated in store', { id, updates: Object.keys(updates) });
    this.notify();
    
    return true;
  }

  /**
   * Delete a device from the store.
   * 
   * @param id The device identifier
   * @returns True if the device was deleted, false if not found
   */
  public delete(id: string): boolean {
    const existed = this.devices.delete(id);
    
    if (existed) {
      logger.debug('device deleted from store', { id });
      this.notify();
    } else {
      logger.warn('Attempted to delete non-existent device', { id });
    }
    
    return existed;
  }

  /**
   * Check if a device exists in the store.
   * 
   * @param id The device identifier
   * @returns True if the device exists
   */
  public has(id: string): boolean {
    return this.devices.has(id);
  }

  /**
   * Subscribe to store changes.
   * The listener will be called whenever the store state changes.
   * 
   * @param listener Callback function to invoke on changes
   * @returns Unsubscribe function to remove the listener
   */
  public subscribe(listener: StoreListener<Device[]>): Unsubscribe {
    this.listeners.add(listener);
    logger.trace('Subscriber added to device store', { count: this.listeners.size });

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
      logger.trace('Subscriber removed from device store', { count: this.listeners.size });
    };
  }

  /**
   * Clear all devices from the store.
   * This will remove all data and notify subscribers.
   */
  public clear(): void {
    const count = this.devices.size;
    this.devices.clear();
    logger.debug('device store cleared', { previousCount: count });
    this.notify();
  }

  /**
   * Get the number of devices in the store.
   * 
   * @returns The count of devices
   */
  public count(): number {
    return this.devices.size;
  }

  /**
   * Find devices matching a predicate function.
   * 
   * @param predicate Function to test each device
   * @returns Array of devices matching the predicate
   */
  public find(predicate: (Device: Device) => boolean): Device[] {
    return this.getAll().filter(predicate);
  }

  /**
   * Bulk set multiple devices at once.
   * More efficient than calling set() multiple times as it only notifies once.
   * 
   * @param devices Array of devices to add/update
   */
  public setMany(devices: Device[]): void {
    devices.forEach(device => {
      this.devices.set(device.id, device);
    });
    
    logger.debug('Bulk devices added to store', { count: devices.length });
    this.notify();
  }

  /**
   * Notify all subscribers of a state change.
   * Calls each listener with the current device array.
   * Catches and logs any errors in listeners to prevent one listener from breaking others.
   */
  private notify(): void {
    const devices = this.getAll();
    
    this.listeners.forEach(listener => {
      try {
        listener(devices);
      } catch (error) {
        logger.error('Error in device store listener', { error });
      }
    });
  }

  /**
   * Export all devices as JSON.
   * Useful for persistence or debugging.
   * 
   * @returns JSON string representation of all devices
   */
  public toJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  /**
   * Import devices from JSON.
   * Replaces existing devices with the imported data.
   * 
   * @param json JSON string containing device data
   * @throws Error if JSON is invalid
   */
  public fromJSON(json: string): void {
    try {
      const devices: Device[] = JSON.parse(json);
      
      if (!Array.isArray(devices)) {
        throw new Error('Invalid JSON: expected an array of devices');
      }

      this.clear();
      this.setMany(devices);
      
      logger.info('devices imported from JSON', { count: devices.length });
    } catch (error) {
      logger.error('Failed to import devices from JSON', { error });
      throw error;
    }
  }
}

/**
 * Singleton device store instance for use throughout the extension.
 * Import this to access the centralized device state.
 * 
 * @example
 * ```typescript
 * import { deviceStore } from './store/deviceStore';
 * 
 * // Get all devices
 * const devices = deviceStore.getAll();
 * 
 * // Subscribe to changes
 * const unsubscribe = deviceStore.subscribe((devices) => {
 *   console.log('devices updated:', devices);
 * });
 * 
 * // Add a device
 * deviceStore.set(device.id, device);
 * 
 * // Cleanup
 * unsubscribe();
 * ```
 */
export const deviceStore = new DeviceStore();
