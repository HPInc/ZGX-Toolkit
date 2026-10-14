/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceConnectionState } from '../store';
import { Device } from '../types';
import { DeviceReachabilityState, DeviceStatus } from '../types/devicestatus';

/*
 * Utility functions for device status
 */

export function getDeviceStatus(
    device: Device,
    connectionState: DeviceConnectionState | undefined,
    reachabilityState: DeviceReachabilityState | undefined,
    isConnectedHere: boolean,
    isConnectedElsewhere: boolean
): DeviceStatus {
    if (isConnectedHere) {
        return DeviceStatus.Connected;
    }

    if (isConnectedElsewhere) {
        return DeviceStatus.ConnectedElsewhere;
    }

    if (!device.isSetup) {
        return DeviceStatus.CompleteSetup; // We track complete setup here so it can be used as a label
    }

    if (reachabilityState?.status === DeviceStatus.Reachable) {
        return DeviceStatus.Reachable;
    }

    if (reachabilityState?.status === DeviceStatus.Unreachable) {
        return DeviceStatus.Unreachable;
    }

    return DeviceStatus.CheckStatus;
}