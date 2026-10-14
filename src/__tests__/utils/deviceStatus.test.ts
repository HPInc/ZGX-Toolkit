/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { getDeviceStatus } from '../../utils/deviceStatus';
import { DeviceStatus } from '../../types/devicestatus';
import { Device } from '../../types/devices';

describe('getDeviceStatus', () => {
    const device = { isSetup: true } as Device;

    it.each([
        [true, false, undefined, DeviceStatus.Connected],
        [false, true, undefined, DeviceStatus.ConnectedElsewhere],
        [false, false, undefined, DeviceStatus.CheckStatus],
        [false, false, { status: DeviceStatus.Reachable, checking: false }, DeviceStatus.Reachable],
        [false, false, { status: DeviceStatus.Unreachable, checking: false }, DeviceStatus.Unreachable],
        [false, false, { status: DeviceStatus.CheckStatus, checking: false }, DeviceStatus.CheckStatus]
    ])('returns %s for the matching state', (isConnectedHere, isConnectedElsewhere, reachabilityState, expected) => {
        expect(getDeviceStatus(
            device,
            undefined,
            reachabilityState,
            isConnectedHere,
            isConnectedElsewhere
        )).toBe(expected);
    });

    it('prioritizes complete setup over reachability for an unconfigured device', () => {
        expect(getDeviceStatus(
            { isSetup: false } as Device,
            undefined,
            { status: DeviceStatus.Reachable, checking: false },
            false,
            false
        )).toBe(DeviceStatus.CompleteSetup);
    });

    it('prioritizes the current connection over another window', () => {
        expect(getDeviceStatus(device, undefined, undefined, true, true)).toBe(DeviceStatus.Connected);
    });
});