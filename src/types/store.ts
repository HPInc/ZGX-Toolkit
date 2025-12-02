/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * State management types for the ZGX Toolkit extension.
 * Defines the structure for observable state management.
 */

import { Device } from './devices';

/**
 * Listener function for store changes.
 */
export type StoreListener<T> = (data: T) => void;

/**
 * Unsubscribe function returned by store subscription.
 */
export type Unsubscribe = () => void;

/**
 * Interface for observable store implementations.
 */
export interface IStore<T> {
  /**
   * Subscribe to store changes.
   * @param listener Callback function to invoke on changes
   * @returns Unsubscribe function
   */
  subscribe(listener: StoreListener<T>): Unsubscribe;

  /**
   * Get the current state.
   * @returns Current state
   */
  getState(): T;

  /**
   * Clear all state.
   */
  clear(): void;
}

/**
 * Interface for device store operations.
 */
export interface IDeviceStore extends IStore<Device[]> {
  /**
   * Get a device by ID.
   * @param id Device identifier
   * @returns The device or undefined if not found
   */
  get(id: string): Device | undefined;

  /**
   * Get all devices.
   * @returns Array of all devices
   */
  getAll(): Device[];

  /**
   * Add or update a device in the store.
   * @param id Device identifier
   * @param device Device data
   */
  set(id: string, device: Device): void;

  /**
   * Update an existing device.
   * @param id Device identifier
   * @param updates Partial device updates
   * @returns True if device was updated
   */
  update(id: string, updates: Partial<Device>): boolean;

  /**
   * Delete a device from the store.
   * @param id Device identifier
   * @returns True if device was deleted
   */
  delete(id: string): boolean;

  /**
   * Check if a device exists in the store.
   * @param id Device identifier
   * @returns True if device exists
   */
  has(id: string): boolean;
}

/**
 * Store change event.
 */
export interface StoreChangeEvent<T> {
  /** Type of change that occurred */
  type: 'add' | 'update' | 'delete' | 'clear';
  /** Data before the change (for updates and deletes) */
  previousData?: T;
  /** Data after the change (for adds and updates) */
  currentData?: T;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Configuration for store persistence.
 */
export interface StorePersistenceConfig {
  /** Key to use for storage */
  key: string;
  /** Whether to enable persistence */
  enabled: boolean;
  /** Debounce time in milliseconds for saving */
  debounceMs?: number;
}
