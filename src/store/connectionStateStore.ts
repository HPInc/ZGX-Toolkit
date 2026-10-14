/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Connection state store for the Z Toolkit extension.
 * Implements observable pattern for reactive state management, following the same
 * shape/pattern as DeviceStore/GroupStore.
 *
 * Holds derived, in-memory connection state - keyed by device id - reconciled from
 * snapshots of the shared active session registry (see RemoteSessionRegistryService).
 */

import { ActiveSessionEntry } from '../types/remoteSession';
import { IStore, StoreListener, Unsubscribe } from '../types/store';
import { logger } from '../utils/logger';
import { STALE_SESSION_THRESHOLD_MS } from '../constants/time';

/**
 * Derived connection state for a single device.
 */
export interface DeviceConnectionState {
    /** Whether the device currently has an active Remote-SSH session in some window */
    connected: boolean;
    /** ISO timestamp of when the session was established */
    connectedAt?: string;
    /** Identifier of the VS Code window that owns the session, used to distinguish "connected
     *  in this window" from "connected in another window" */
    windowId?: string;
}

export interface ConnectionStateReconcileResult {
    disconnectedDeviceIds: string[];
    staleDeviceIds: string[];
}

/**
 * ConnectionStateStore tracks which devices currently have an active Remote-SSH session,
 * across all VS Code windows. It is populated by subscribing to
 * RemoteSessionRegistryService.onDidChange; stale entries (heartbeat older than
 * STALE_SESSION_THRESHOLD_MS) are pruned on every reconciliation rather than kept as connected.
 */
export class ConnectionStateStore implements IStore<Map<string, DeviceConnectionState>> {
    private connections = new Map<string, DeviceConnectionState>();
    private readonly listeners = new Set<StoreListener<Map<string, DeviceConnectionState>>>();

    /**
     * Get the connection state for a device.
     *
     * @param deviceId The device identifier
     * @returns The connection state, or undefined if the device has no active session
     */
    public get(deviceId: string): DeviceConnectionState | undefined {
        return this.connections.get(deviceId);
    }

    /**
     * Check whether a device currently has an active connection.
     *
     * @param deviceId The device identifier
     */
    public isConnected(deviceId: string): boolean {
        return this.connections.get(deviceId)?.connected ?? false;
    }

    /**
     * Get all connection states, keyed by device id.
     * Returns a new Map to prevent external mutations.
     */
    public getAll(): Map<string, DeviceConnectionState> {
        return new Map(this.connections);
    }

    /**
     * Get the current state (alias for getAll). Implements IStore interface.
     */
    public getState(): Map<string, DeviceConnectionState> {
        return this.getAll();
    }

    /**
     * Check if a device has a connection state entry.
     *
     * @param deviceId The device identifier
     */
    public has(deviceId: string): boolean {
        return this.connections.has(deviceId);
    }

    /**
     * Get the number of devices with a connection state entry.
     */
    public count(): number {
        return this.connections.size;
    }

    /**
     * Subscribe to store changes.
     * The listener is invoked with the full connection state map whenever it is reconciled.
     *
     * @param listener Callback function to invoke on changes
     * @returns Unsubscribe function to remove the listener
     */
    public subscribe(listener: StoreListener<Map<string, DeviceConnectionState>>): Unsubscribe {
        this.listeners.add(listener);
        logger.trace('Subscriber added to connection state store', { count: this.listeners.size });

        return () => {
            this.listeners.delete(listener);
            logger.trace('Subscriber removed from connection state store', { count: this.listeners.size });
        };
    }

    /**
     * Clear all connection state entries and notify subscribers.
     */
    public clear(): void {
        const count = this.connections.size;
        this.connections.clear();
        logger.debug('Connection state store cleared', { previousCount: count });
        this.notify();
    }

    /**
     * Reconcile the store against a fresh snapshot of active session entries - e.g. from
     * RemoteSessionRegistryService.onDidChange or readAll(). Entries whose heartbeat is
     * older than STALE_SESSION_THRESHOLD_MS are pruned instead of kept as connected, so a
     * window that crashed without unregistering doesn't leave a device stuck "connected".
     *
     * @param entries The latest full snapshot of active session entries
     */
    public reconcile(entries: ActiveSessionEntry[]): ConnectionStateReconcileResult {
        const now = Date.now();
        const next = new Map<string, DeviceConnectionState>();
        const staleDeviceIds: string[] = [];

        for (const entry of entries) {
            const lastHeartbeatMs = Date.parse(entry.lastHeartbeat);
            const isStale = !Number.isFinite(lastHeartbeatMs) || now - lastHeartbeatMs > STALE_SESSION_THRESHOLD_MS;

            if (isStale) {
                staleDeviceIds.push(entry.deviceId);
                logger.debug('Pruning stale remote session entry', { deviceId: entry.deviceId, lastHeartbeat: entry.lastHeartbeat });
                continue;
            }

            next.set(entry.deviceId, { connected: true, connectedAt: entry.connectedAt, windowId: entry.windowId });
        }

        if (this.isSameState(this.connections, next)) {
            logger.trace('Connection state store reconciled with no changes, skipping notify');
            return { disconnectedDeviceIds: [], staleDeviceIds: [] };
        }

        const disconnectedDeviceIds = [...this.connections.keys()].filter(deviceId => !next.has(deviceId));
        this.connections = next;
        logger.trace('Connection state store reconciled', { count: next.size });
        this.notify();
        return {
            disconnectedDeviceIds,
            staleDeviceIds: staleDeviceIds.filter(deviceId => disconnectedDeviceIds.includes(deviceId))
        };
    }

    /**
     * Compare two connection state maps for equality, so reconcile() can skip notifying
     * subscribers (and triggering unnecessary view refreshes) when nothing actually changed -
     * e.g. on every periodic reconcile where the registry file hasn't been touched.
     */
    private isSameState(a: Map<string, DeviceConnectionState>, b: Map<string, DeviceConnectionState>): boolean {
        if (a.size !== b.size) {
            return false;
        }

        for (const [deviceId, state] of a) {
            const other = b.get(deviceId);
            if (other?.connected !== state.connected || other?.connectedAt !== state.connectedAt || other?.windowId !== state.windowId) {
                return false;
            }
        }

        return true;
    }

    /**
     * Notify all subscribers of a state change.
     * Catches and logs any errors in listeners to prevent one listener from breaking others.
     */
    private notify(): void {
        const state = this.getAll();

        this.listeners.forEach(listener => {
            try {
                listener(state);
            } catch (error) {
                logger.error('Error in connection state store listener', { error });
            }
        });
    }
}

/**
 * Singleton connection state store instance for use throughout the extension.
 *
 * @example
 * ```typescript
 * import { connectionStateStore } from './store';
 * import { remoteSessionRegistryService } from './services';
 *
 * // Keep the store in sync with the shared active session registry:
 * const subscription = remoteSessionRegistryService.onDidChange(entries => {
 *   connectionStateStore.reconcile(entries);
 * });
 *
 * // Read connection state:
 * if (connectionStateStore.isConnected(device.id)) { ... }
 * ```
 */
export const connectionStateStore = new ConnectionStateStore();
