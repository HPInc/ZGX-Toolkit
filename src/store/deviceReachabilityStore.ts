/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */


/** 
 * Store for managing the reachability state of devices.
 * Mirrors the implementation of deviceReachabilityStore in terms of managing state and notifying listeners.
 */


import { DeviceReachabilityState, DeviceStatus } from '../types/devicestatus';
import { IStore, StoreListener, Unsubscribe } from '../types/store';

// Both need to be stored
export interface DeviceReachabilitySnapshot {
    states: Record<string, DeviceReachabilityState>;
    lastQueryTimestamp?: string;
}

export class DeviceReachabilityStore implements IStore<Map<string,DeviceReachabilityState>> {
    private readonly states = new Map<string, DeviceReachabilityState>();
    private readonly listeners = new Set<
        StoreListener<Map<string, DeviceReachabilityState>>
    >();
    // Devices with a check in flight that a user explicitly requested (vs. a silent background
    // check), so every view can decide whether to animate consistently. Not persisted.
    private readonly explicitCheckDeviceIds = new Set<string>();

    private lastQueryTimestamp?: string;

    public getLastQueryTimestamp(): string {
        return this.lastQueryTimestamp ?? 'Never';
    }

    public markQueryCompleted(timestamp = new Date().toISOString()): void {
        this.lastQueryTimestamp = timestamp;
        this.notify();
    }


    public get(deviceId: string): DeviceReachabilityState | undefined {
        return this.states.get(deviceId);
    }

    public isExplicitCheck(deviceId: string): boolean {
        return this.explicitCheckDeviceIds.has(deviceId);
    }

    public getState(): Map<string, DeviceReachabilityState> {
        return new Map(this.states);
    }

    public getSnapshot(): DeviceReachabilitySnapshot {
        return {
            states: Object.fromEntries(this.states),
            lastQueryTimestamp: this.lastQueryTimestamp
        };
    }

    public restore(snapshot: DeviceReachabilitySnapshot): void {
        this.states.clear();
        Object.keys(snapshot.states).forEach(deviceId => {
            this.states.set(deviceId, {
                status: DeviceStatus.CheckStatus,
                checking: false
            });
        });
        this.lastQueryTimestamp = undefined;
        this.notify();
    }

    public subscribe(
        listener: StoreListener<Map<string, DeviceReachabilityState>>
    ): Unsubscribe {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public clear(): void {
        this.states.clear();
        this.lastQueryTimestamp = undefined;
        this.explicitCheckDeviceIds.clear();
        this.notify();
    }

    public set(
        deviceId: string,
        state: DeviceReachabilityState
    ): void {
        this.states.set(deviceId, state);
        this.notify();
    }

    private notify(): void {
        const state = this.getState();

        this.listeners.forEach(listener => {
            listener(state);
        });
    }

    public setChecking(deviceId: string): void {
        // Preserve the last known status so an in-flight recheck doesn't visibly regress the UI.
        const previous = this.states.get(deviceId);
        this.set(deviceId, {
            status: previous?.status ?? DeviceStatus.CheckStatus,
            checking: true,
            checkedAt: previous?.checkedAt,
            error: previous?.error
        });
    }

    public setResult(deviceId: string, status: DeviceStatus, error?: string): void {
        this.set(deviceId, {
            status,
            checking: false,
            error,
            checkedAt: new Date().toISOString()
        });
    }

    /**
     * Batched form of setChecking for multiple devices - applies all "checking" flags and
     * notifies subscribers once, instead of once per device.
     *
     * @param explicit Whether this check was directly requested by the user (e.g. "Check
     * Status"/"Refresh Status"), as opposed to a silent background check. Tracked so every
     * view can decide, consistently, whether to animate these devices.
     */
    public beginChecking(deviceIds: string[], explicit = false): void {
        if (deviceIds.length === 0) {
            return;
        }

        for (const deviceId of deviceIds) {
            // Reset here (not at completion) so the completion notification for this check
            // still reports the correct explicit flag; only a newly-started check decides it.
            if (explicit) {
                this.explicitCheckDeviceIds.add(deviceId);
            } else {
                this.explicitCheckDeviceIds.delete(deviceId);
            }
            const previous = this.states.get(deviceId);
            this.states.set(deviceId, {
                status: previous?.status ?? DeviceStatus.CheckStatus,
                checking: true,
                checkedAt: previous?.checkedAt,
                error: previous?.error
            });
        }
        this.notify();
    }

    /**
     * Batched form of setResult for multiple devices, without touching lastQueryTimestamp -
     * for state changes that aren't the completion of a reachability query (e.g. marking
     * devices as stale after a connection reconciliation). Notifies subscribers once.
     */
    public setManyResults(results: { deviceId: string; status: DeviceStatus; error?: string }[]): void {
        if (results.length === 0) {
            return;
        }

        const checkedAt = new Date().toISOString();
        for (const { deviceId, status, error } of results) {
            this.states.set(deviceId, { status, checking: false, error, checkedAt });
        }
        this.notify();
    }

    /**
     * Apply the results of a completed reachability query for multiple devices and update
     * lastQueryTimestamp, notifying subscribers once regardless of how many devices were
     * checked (as opposed to one notify per setResult call plus one for markQueryCompleted).
     */
    public completeQuery(
        results: { deviceId: string; status: DeviceStatus; error?: string }[],
        timestamp = new Date().toISOString()
    ): void {
        for (const { deviceId, status, error } of results) {
            this.states.set(deviceId, { status, checking: false, error, checkedAt: timestamp });
        }
        this.lastQueryTimestamp = timestamp;
        this.notify();
    }
}

export const deviceReachabilityStore = new DeviceReachabilityStore();