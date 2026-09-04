/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Device, DeviceFingerprint } from '../../types/devices';

/**
 * A probe that collects a portion of a device fingerprint.
 * Probes are registered at construction and executed in order during fingerprint building.
 * Later probes win on conflict (simple merge order).
 */
export interface FingerprintProbe {
    /** Unique identifier for this probe */
    readonly probeName: string;

    /**
     * Execute the probe against a device and return partial fingerprint data.
     * Implementations should handle errors gracefully. On failure, return partial data
     * with relevant fields set to "unknown" rather than returning an empty object,
     * so callers can distinguish a failed probe from a probe that simply has no data yet.
     *
     * @param device The remote device to probe
     * @returns Partial fingerprint data, with "unknown" values for fields that could not be determined
     */
    execute(device: Device): Promise<Partial<DeviceFingerprint>>;
}
