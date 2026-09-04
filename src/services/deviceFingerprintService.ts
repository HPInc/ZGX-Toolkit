/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Service for building a hardware fingerprint for remote ZGX or Z series devices.
 * Uses a probe-based plugin architecture to collect fingerprint data from various sources.
 */

import { Device, DeviceFingerprint, DeviceType } from '../types/devices';
import { logger } from '../utils/logger';
import { FingerprintProbe, DeviceTypeProbe } from './probes';

/**
 * Updates allowed when modifying a persisted fingerprint.
 * Currently only deviceType is persisted.
 */
export interface DeviceFingerprintUpdate {
    deviceType?: DeviceType;
}

/**
 * Service responsible for collecting and resolving device fingerprints.
 * Uses a probe-based architecture where each probe contributes to the final fingerprint.
 * Probes are registered at construction time and executed in order during fingerprint building.
 */
export class DeviceFingerprintService {
    private readonly probes: FingerprintProbe[];

    constructor() {
        // Register probes at construction time
        this.probes = [new DeviceTypeProbe()];
    }

    /**
     * Update an existing fingerprint with new values.
     * User-selected deviceType is authoritative.
     *
     * @param existingFingerprint Existing persisted fingerprint, if any
     * @param updates Partial fingerprint updates
     * @returns Finalized persisted fingerprint
     */
    public updateDeviceFingerprint(
        existingFingerprint: DeviceFingerprint | undefined,
        updates: DeviceFingerprintUpdate
    ): DeviceFingerprint {
        const mergedFingerprint: DeviceFingerprint = {
            ...existingFingerprint,
            ...updates
        };
        return mergedFingerprint;
    }

    /**
     * Build a device fingerprint from the currently registered probes.
     * Executes all probes in order, merging partial results.
     * Does not block on probe failures (graceful degradation).
     * Later probes win on conflict.
     *
     * @param device The remote device
     * @returns Built fingerprint with resolved device type and other probe data
     */
    public async buildDeviceFingerprint(device: Device): Promise<DeviceFingerprint> {
        const fingerprintParts: Partial<DeviceFingerprint>[] = [];

        for (const probe of this.probes) {
            try {
                logger.debug(`Executing fingerprint probe: ${probe.probeName}`, { device: device.name });
                const partialResult = await probe.execute(device);
                fingerprintParts.push(partialResult);
            } catch (error) {
                logger.error(`Fingerprint probe failed: ${probe.probeName}`, {
                    device: device.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                // Continue with next probe; don't block on failure
            }
        }

        // Merge all partial results (later probes win on conflict)
        const mergedPartial = Object.assign({}, ...fingerprintParts) as DeviceFingerprint;
        return mergedPartial;
    }
}

export const deviceFingerprintService = new DeviceFingerprintService();
