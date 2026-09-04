/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Covers the catch branch in DeviceFingerprintService.buildDeviceFingerprint when a
 * probe itself throws (as opposed to a probe catching its own errors internally).
 */

import { DeviceFingerprintService } from '../../services/deviceFingerprintService';
import { Device } from '../../types/devices';

jest.mock('../../services/probes', () => ({
    DeviceTypeProbe: jest.fn().mockImplementation(() => ({
        probeName: 'deviceType',
        execute: jest.fn().mockRejectedValue(new Error('probe crashed'))
    }))
}));

describe('DeviceFingerprintService - buildDeviceFingerprint probe error handling', () => {
    it('continues gracefully and returns an empty partial fingerprint when a probe throws', async () => {
        const service = new DeviceFingerprintService();
        const device: Device = {
            id: 'device-1',
            name: 'Device',
            host: '192.168.1.10', // NOSONAR
            username: 'testuser',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: new Date().toISOString()
        };

        const fingerprint = await service.buildDeviceFingerprint(device);

        expect(fingerprint).toEqual({});
    });
});
