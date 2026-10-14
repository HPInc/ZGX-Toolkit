/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/*
 * Device status types and labels
 */

export enum DeviceStatus{
    Connected = 'connected',
    ConnectedElsewhere = 'connected-elsewhere',
    CompleteSetup = 'complete-setup',
    Reachable = 'reachable',
    Unreachable = 'unreachable',
    CheckStatus = 'check-status'
}

export interface DeviceReachabilityState {
    status: DeviceStatus;
    checkedAt?: string;
    error?: string;
    checking: boolean;
}

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
    [DeviceStatus.Connected]: 'Connected',
    [DeviceStatus.ConnectedElsewhere]: 'Connected in another window',
    [DeviceStatus.CompleteSetup]: 'Complete Setup',
    [DeviceStatus.Reachable]: 'Reachable',
    [DeviceStatus.Unreachable]: 'Unreachable',
    [DeviceStatus.CheckStatus]: 'Check Status'
};