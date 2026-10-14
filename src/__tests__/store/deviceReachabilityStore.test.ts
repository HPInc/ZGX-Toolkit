/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceReachabilityStore } from '../../store/deviceReachabilityStore';
import { DeviceStatus } from '../../types/devicestatus';

describe('DeviceReachabilityStore', () => {
    let store: DeviceReachabilityStore;

    beforeEach(() => {
        store = new DeviceReachabilityStore();
    });

    it('tracks states, timestamps, snapshots, and listeners', () => {
        const listener = jest.fn();
        const unsubscribe = store.subscribe(listener);

        store.set('device-1', { status: DeviceStatus.Reachable, checking: false });
        store.markQueryCompleted('2026-09-18T10:00:00.000Z');

        expect(store.get('device-1')?.status).toBe(DeviceStatus.Reachable);
        expect(store.getState()).toEqual(new Map([
            ['device-1', { status: DeviceStatus.Reachable, checking: false }]
        ]));
        expect(store.getLastQueryTimestamp()).toBe('2026-09-18T10:00:00.000Z');
        expect(store.getSnapshot()).toEqual({
            states: { 'device-1': { status: DeviceStatus.Reachable, checking: false } },
            lastQueryTimestamp: '2026-09-18T10:00:00.000Z'
        });
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        store.clear();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(store.getLastQueryTimestamp()).toBe('Never');
    });

    it('preserves the previous result while checking again', () => {
        store.set('device-1', {
            status: DeviceStatus.Reachable,
            checking: false,
            checkedAt: 'before',
            error: 'old error'
        });

        store.setChecking('device-1');

        expect(store.get('device-1')).toEqual({
            status: DeviceStatus.Reachable,
            checking: true,
            checkedAt: 'before',
            error: 'old error'
        });
    });

    it('restores every persisted state as check-status on launch', () => {
        store.restore({
            states: {
                checking: { status: DeviceStatus.Reachable, checking: true },
                complete: { status: DeviceStatus.Reachable, checking: false }
            },
            lastQueryTimestamp: '2026-09-17T10:00:00.000Z'
        });

        expect(store.get('checking')).toEqual({
            status: DeviceStatus.CheckStatus,
            checking: false
        });
        expect(store.get('complete')).toEqual({ status: DeviceStatus.CheckStatus, checking: false });
        expect(store.getLastQueryTimestamp()).toBe('Never');
    });

    it('uses check-status as the default when checking an unknown device', () => {
        store.setChecking('device-1');

        expect(store.get('device-1')).toEqual({
            status: DeviceStatus.CheckStatus,
            checking: true,
            checkedAt: undefined,
            error: undefined
        });
    });

    describe('beginChecking', () => {
        it('marks multiple devices as checking with a single notify', () => {
            store.set('device-2', { status: DeviceStatus.Reachable, checking: false, checkedAt: 'before' });
            const listener = jest.fn();
            store.subscribe(listener);

            store.beginChecking(['device-1', 'device-2']);

            expect(store.get('device-1')).toEqual({
                status: DeviceStatus.CheckStatus,
                checking: true,
                checkedAt: undefined,
                error: undefined
            });
            expect(store.get('device-2')).toEqual(expect.objectContaining({
                status: DeviceStatus.Reachable,
                checking: true,
                checkedAt: 'before'
            }));
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('does not notify for an empty device list', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.beginChecking([]);

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('setManyResults', () => {
        it('applies results for multiple devices with a single notify and no timestamp change', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.setManyResults([
                { deviceId: 'device-1', status: DeviceStatus.CheckStatus, error: 'stale' },
                { deviceId: 'device-2', status: DeviceStatus.Reachable }
            ]);

            expect(store.get('device-1')).toEqual(expect.objectContaining({
                status: DeviceStatus.CheckStatus,
                checking: false,
                error: 'stale'
            }));
            expect(store.get('device-2')).toEqual(expect.objectContaining({
                status: DeviceStatus.Reachable,
                checking: false
            }));
            expect(listener).toHaveBeenCalledTimes(1);
            expect(store.getLastQueryTimestamp()).toBe('Never');
        });

        it('does not notify for an empty results list', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.setManyResults([]);

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('completeQuery', () => {
        it('applies results and updates lastQueryTimestamp with a single notify', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.completeQuery([
                { deviceId: 'device-1', status: DeviceStatus.Reachable }
            ], '2026-09-22T12:00:00.000Z');

            expect(store.get('device-1')).toEqual({
                status: DeviceStatus.Reachable,
                checking: false,
                error: undefined,
                checkedAt: '2026-09-22T12:00:00.000Z'
            });
            expect(store.getLastQueryTimestamp()).toBe('2026-09-22T12:00:00.000Z');
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('notifies and updates the timestamp even with no results', () => {
            const listener = jest.fn();
            store.subscribe(listener);

            store.completeQuery([], '2026-09-22T12:30:00.000Z');

            expect(store.getLastQueryTimestamp()).toBe('2026-09-22T12:30:00.000Z');
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('isExplicitCheck', () => {
        it('stays true through completion so the finishing notification can still animate', () => {
            store.beginChecking(['device-1'], true);
            expect(store.isExplicitCheck('device-1')).toBe(true);

            store.completeQuery([{ deviceId: 'device-1', status: DeviceStatus.Unreachable }]);

            // Must remain true after the check completes; the client relies on this exact
            // notification to clear its animation. Clearing it here instead would report
            // explicit: false on completion and leave the UI stuck mid-animation.
            expect(store.isExplicitCheck('device-1')).toBe(true);
        });

        it('is cleared once a subsequent background check begins for the same device', () => {
            store.beginChecking(['device-1'], true);
            store.completeQuery([{ deviceId: 'device-1', status: DeviceStatus.Reachable }]);

            store.beginChecking(['device-1'], false);

            expect(store.isExplicitCheck('device-1')).toBe(false);
        });

        it('is false by default and after clear()', () => {
            expect(store.isExplicitCheck('device-1')).toBe(false);

            store.beginChecking(['device-1'], true);
            store.clear();

            expect(store.isExplicitCheck('device-1')).toBe(false);
        });

        it('setManyResults does not clear the explicit flag', () => {
            store.beginChecking(['device-1'], true);

            store.setManyResults([{ deviceId: 'device-1', status: DeviceStatus.CheckStatus }]);

            expect(store.isExplicitCheck('device-1')).toBe(true);
        });
    });
});