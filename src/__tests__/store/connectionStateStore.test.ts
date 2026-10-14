/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for connectionStateStore.
 * Validates state management, observable pattern implementation, and stale-entry pruning.
 */

import { ConnectionStateStore } from '../../store/connectionStateStore';
import { ActiveSessionEntry } from '../../types/remoteSession';
import { STALE_SESSION_THRESHOLD_MS } from '../../constants/time';

jest.mock('../../utils/logger', () => ({
    logger: {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

function createEntry(overrides: Partial<ActiveSessionEntry> = {}): ActiveSessionEntry {
    const now = new Date().toISOString();
    return {
        deviceId: 'device-1',
        connectLabel: 'user@host',
        windowId: 'window-1',
        connectedAt: now,
        lastHeartbeat: now,
        ...overrides
    };
}

describe('ConnectionStateStore', () => {
    let store: ConnectionStateStore;

    beforeEach(() => {
        store = new ConnectionStateStore();
    });

    describe('Basic Operations', () => {
        it('should start with empty state', () => {
            expect(store.getAll().size).toBe(0);
            expect(store.count()).toBe(0);
        });

        it('should report devices as not connected before reconciliation', () => {
            expect(store.isConnected('device-1')).toBe(false);
            expect(store.get('device-1')).toBeUndefined();
            expect(store.has('device-1')).toBe(false);
        });
    });

    describe('reconcile', () => {
        it('should populate connection state from active session entries', () => {
            const entry = createEntry();

            store.reconcile([entry]);

            expect(store.isConnected('device-1')).toBe(true);
            expect(store.get('device-1')).toEqual({ connected: true, connectedAt: entry.connectedAt, windowId: entry.windowId });
            expect(store.count()).toBe(1);
        });

        it('should replace prior state entirely on each reconciliation', () => {
            store.reconcile([createEntry({ deviceId: 'device-1' })]);
            store.reconcile([createEntry({ deviceId: 'device-2' })]);

            expect(store.has('device-1')).toBe(false);
            expect(store.has('device-2')).toBe(true);
            expect(store.count()).toBe(1);
        });

        it('should prune entries whose heartbeat is older than the stale threshold', () => {
            const staleHeartbeat = new Date(Date.now() - (STALE_SESSION_THRESHOLD_MS + 1000)).toISOString();

            store.reconcile([createEntry({ lastHeartbeat: staleHeartbeat })]);

            expect(store.has('device-1')).toBe(false);
            expect(store.count()).toBe(0);
        });

        it('should identify a stale session removed from an active state as unexpectedly disconnected', () => {
            store.reconcile([createEntry()]);
            const staleHeartbeat = new Date(Date.now() - (STALE_SESSION_THRESHOLD_MS + 1000)).toISOString();

            const result = store.reconcile([createEntry({ lastHeartbeat: staleHeartbeat })]);

            expect(result).toEqual({
                disconnectedDeviceIds: ['device-1'],
                staleDeviceIds: ['device-1']
            });
        });

        it('should keep entries whose heartbeat is within the stale threshold', () => {
            const freshHeartbeat = new Date(Date.now() - 1000).toISOString();

            store.reconcile([createEntry({ lastHeartbeat: freshHeartbeat })]);

            expect(store.isConnected('device-1')).toBe(true);
        });

        it('should prune entries with an unparsable heartbeat timestamp', () => {
            store.reconcile([createEntry({ lastHeartbeat: 'not-a-date' })]);

            expect(store.count()).toBe(0);
        });

        it('should notify subscribers with the reconciled state', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            const entry = createEntry();
            store.reconcile([entry]);

            expect(listener).toHaveBeenCalledTimes(1);
            const state = listener.mock.calls[0][0] as Map<string, unknown>;
            expect(state.get('device-1')).toEqual({ connected: true, connectedAt: entry.connectedAt, windowId: entry.windowId });
        });

        it('should not notify subscribers when reconciling with identical entries', () => {
            const entry = createEntry();
            store.reconcile([entry]);

            const listener = jest.fn();
            store.subscribe(listener);
            store.reconcile([entry]);

            expect(listener).not.toHaveBeenCalled();
        });

        it('should not notify subscribers when reconciling repeatedly against an empty registry', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.reconcile([]);

            expect(listener).not.toHaveBeenCalled();
        });

        it('should notify subscribers when a device is added to an existing state', () => {
            store.reconcile([createEntry({ deviceId: 'device-1' })]);

            const listener = jest.fn();
            store.subscribe(listener);
            store.reconcile([createEntry({ deviceId: 'device-1' }), createEntry({ deviceId: 'device-2' })]);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should notify subscribers when a device is removed', () => {
            store.reconcile([createEntry({ deviceId: 'device-1' }), createEntry({ deviceId: 'device-2' })]);

            const listener = jest.fn();
            store.subscribe(listener);
            store.reconcile([createEntry({ deviceId: 'device-1' })]);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should notify subscribers when a device\'s windowId changes', () => {
            store.reconcile([createEntry({ windowId: 'window-1' })]);

            const listener = jest.fn();
            store.subscribe(listener);
            store.reconcile([createEntry({ windowId: 'window-2' })]);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should notify subscribers when a device\'s connectedAt changes', () => {
            const first = createEntry({ connectedAt: new Date(Date.now() - 5000).toISOString() });
            store.reconcile([first]);

            const listener = jest.fn();
            store.subscribe(listener);
            store.reconcile([createEntry({ connectedAt: new Date().toISOString() })]);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('subscribe', () => {
        it('should stop notifying after unsubscribing', () => {
            const listener = jest.fn();
            const unsubscribe = store.subscribe(listener);

            unsubscribe();
            store.reconcile([createEntry()]);

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should remove all entries and notify subscribers', () => {
            store.reconcile([createEntry()]);
            const listener = jest.fn();
            store.subscribe(listener);

            store.clear();

            expect(store.count()).toBe(0);
            expect(listener).toHaveBeenCalledWith(new Map());
        });
    });
});
