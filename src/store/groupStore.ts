/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * ConnectX Group state management store for the ZGX Toolkit extension.
 * Implements observable pattern for reactive state management.
 * 
 */

import { ConnectXGroup } from '../types/connectxGroup';
import { IStore, StoreListener, Unsubscribe } from '../types/store';
import { logger } from '../utils/logger';

/**
 * GroupStore provides centralized state management for ConnectX Group data.
 * Uses the observable pattern to notify subscribers of state changes.
 * 
 * This store provides type-safe operations for managing groups.
 */
export class GroupStore implements IStore<ConnectXGroup[]> {
    private readonly groups = new Map<string, ConnectXGroup>();
    private readonly listeners = new Set<StoreListener<ConnectXGroup[]>>();

    /**
     * Get a group by its unique identifier.
     * 
     * @param id The group identifier
     * @returns The group object or undefined if not found
     */
    public get(id: string): ConnectXGroup | undefined {
        return this.groups.get(id);
    }

    /**
     * Get all groups as an array.
     * Returns a new array to prevent external mutations.
     * 
     * @returns Array of all groups
     */
    public getAll(): ConnectXGroup[] {
        return Array.from(this.groups.values());
    }

    /**
     * Get the current state (alias for getAll).
     * Implements IStore interface.
     * 
     * @returns Array of all groups
     */
    public getState(): ConnectXGroup[] {
        return this.getAll();
    }

    /**
     * Add or replace a group in the store.
     * If a group with the same ID exists, it will be replaced.
     * Notifies all subscribers of the change.
     * 
     * @param id The group identifier
     * @param group The group object to store
     */
    public set(id: string, group: ConnectXGroup): void {
        const isUpdate = this.groups.has(id);
        this.groups.set(id, group);
      
        logger.debug(`Group ${isUpdate ? 'updated' : 'added'} to store`, { id, deviceCount: group.deviceIds.length });
        this.notify();
    }

    /**
     * Update an existing group with partial data.
     * Merges the updates with the existing group data.
     * 
     * @param id The group identifier
     * @param updates Partial group data to merge
     * @returns True if the group was updated, false if not found
     */
    public update(id: string, updates: Partial<ConnectXGroup>): boolean {
        const group = this.groups.get(id);
      
        if (!group) {
            logger.warn('Attempted to update non-existent group', { id });
            return false;
        }

        // Merge updates with existing group
        const updatedGroup: ConnectXGroup = {
            ...group,
            ...updates,
            // Always update the timestamp
            updatedAt: new Date().toISOString(),
        };

        this.groups.set(id, updatedGroup);
        logger.debug('Group updated in store', { id, updates: Object.keys(updates) });
        this.notify();
      
        return true;
    }

    /**
     * Delete a group from the store.
     * 
     * @param id The group identifier
     * @returns True if the group was deleted, false if not found
     */
    public delete(id: string): boolean {
        const existed = this.groups.delete(id);
      
        if (existed) {
            logger.debug('Group deleted from store', { id });
            this.notify();
        } else {
            logger.warn('Attempted to delete non-existent group', { id });
        }
      
        return existed;
    }

    /**
     * Check if a group exists in the store.
     * 
     * @param id The group identifier
     * @returns True if the group exists
     */
    public has(id: string): boolean {
        return this.groups.has(id);
    }

    /**
     * Subscribe to store changes.
     * The listener will be called whenever the store state changes.
     * 
     * @param listener Callback function to invoke on changes
     * @returns Unsubscribe function to remove the listener
     */
    public subscribe(listener: StoreListener<ConnectXGroup[]>): Unsubscribe {
        this.listeners.add(listener);
        logger.trace('Subscriber added to group store', { count: this.listeners.size });

        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
            logger.trace('Subscriber removed from group store', { count: this.listeners.size });
        };
    }

    /**
     * Clear all groups from the store.
     * This will remove all data and notify subscribers.
     */
    public clear(): void {
        const count = this.groups.size;
        this.groups.clear();
        logger.debug('Group store cleared', { previousCount: count });
        this.notify();
    }

    /**
     * Get the number of groups in the store.
     * 
     * @returns The count of groups
     */
    public count(): number {
        return this.groups.size;
    }

    /**
     * Find groups matching a predicate function.
     * 
     * @param predicate Function to test each group
     * @returns Array of groups matching the predicate
     */
    public find(predicate: (group: ConnectXGroup) => boolean): ConnectXGroup[] {
        return this.getAll().filter(predicate);
    }

    /**
     * Find a group that contains a specific device.
     * 
     * @param deviceId The device ID to search for
     * @returns The group containing the device, or undefined if not found
     */
    public findByDevice(deviceId: string): ConnectXGroup | undefined {
        return this.getAll().find(group => group.deviceIds.includes(deviceId));
    }

    /**
     * Bulk set multiple groups at once.
     * More efficient than calling set() multiple times as it only notifies once.
     * 
     * @param groups Array of groups to add/update
     */
    public setMany(groups: ConnectXGroup[]): void {
        for (const group of groups) {
            this.groups.set(group.id, group);
        }
      
        logger.debug('Bulk groups added to store', { count: groups.length });
        this.notify();
    }

    /**
     * Notify all subscribers of a state change.
     * Calls each listener with the current group array.
     * Catches and logs any errors in listeners to prevent one listener from breaking others.
     */
    private notify(): void {
        const groups = this.getAll();
      
        for (const listener of this.listeners) {
            try {
                listener(groups);
            } catch (error) {
                logger.error('Error in group store listener', { error });
            }
        }
    }

    /**
     * Export all groups as JSON.
     * Useful for persistence or debugging.
     * 
     * @returns JSON string representation of all groups
     */
    public toJSON(): string {
        return JSON.stringify(this.getAll(), null, 2);
    }

    /**
     * Import groups from JSON.
     * Replaces existing groups with the imported data.
     * 
     * @param json JSON string containing group data
     * @throws Error if JSON is invalid
     */
    public fromJSON(json: string): void {
        try {
            const groups: ConnectXGroup[] = JSON.parse(json);
        
            if (!Array.isArray(groups)) {
                throw new TypeError('Invalid JSON: expected an array of groups');
            }

            this.clear();
            this.setMany(groups);
        
            logger.info('Groups imported from JSON', { count: groups.length });
        } catch (error) {
            logger.error('Failed to import groups from JSON', { error });
            throw error;
        }
    }
}

export const groupStore = new GroupStore();
