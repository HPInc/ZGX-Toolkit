/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import {
    buildRemoteConnectLabel,
    extractConnectLabelFromRemoteAuthority,
    findDeviceByConnectLabel
} from '../../utils/remoteConnectLabel';
import { Device } from '../../types/devices';

describe('remoteConnectLabel', () => {
    const makeDevice = (overrides: Partial<Device> = {}): Device => ({
        id: 'device-1',
        name: 'Test Device',
        host: 'device.example.com',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    });

    describe('buildRemoteConnectLabel', () => {
        it('uses user@host for the default SSH port', () => {
            expect(buildRemoteConnectLabel(makeDevice())).toBe('zgx@device.example.com');
        });

        it('uses a sanitized stable alias for a non-default SSH port', () => {
            const device = makeDevice({ host: 'device name/@example.com', port: 2222 });

            expect(buildRemoteConnectLabel(device)).toBe('zgx-devicenameexample.com-2222');
        });
    });

    describe('extractConnectLabelFromRemoteAuthority', () => {
        it('decodes a Remote-SSH authority label', () => {
            expect(extractConnectLabelFromRemoteAuthority('ssh-remote+zgx%40device.example.com'))
                .toBe('zgx@device.example.com');
        });

        it.each([undefined, '', 'wsl+Ubuntu', 'ssh-remote+'])(
            'returns undefined for an unsupported authority: %s',
            remoteAuthority => {
                expect(extractConnectLabelFromRemoteAuthority(remoteAuthority)).toBeUndefined();
            }
        );

        it('returns the original label when its URI encoding is malformed', () => {
            expect(extractConnectLabelFromRemoteAuthority('ssh-remote+device%ZZ')).toBe('device%ZZ');
        });
    });

    describe('findDeviceByConnectLabel', () => {
        it('finds the device with the matching generated label', () => {
            const defaultPortDevice = makeDevice();
            const customPortDevice = makeDevice({ id: 'device-2', host: '10.0.0.2', port: 2200 });

            expect(findDeviceByConnectLabel([defaultPortDevice, customPortDevice], 'zgx-10.0.0.2-2200'))
                .toBe(customPortDevice);
        });

        it('returns undefined when no device label matches', () => {
            expect(findDeviceByConnectLabel([makeDevice()], 'unknown-host')).toBeUndefined();
        });
    });
});