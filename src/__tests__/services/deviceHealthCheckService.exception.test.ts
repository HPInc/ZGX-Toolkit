/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Covers the catch branch in DeviceHealthCheckService.checkDeviceHealth when
 * testSSHConnection itself throws (as opposed to resolving with a failure result).
 */

import { DeviceHealthCheckService } from '../../services/deviceHealthCheckService';
import { Device } from '../../types/devices';
import { testSSHConnection } from '../../utils/sshConnection';

jest.mock('../../utils/sshConnection', () => ({
    testSSHConnection: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

describe('DeviceHealthCheckService - checkDeviceHealth exception path', () => {
    it('captures the error message when testSSHConnection throws synchronously', async () => {
        (testSSHConnection as jest.Mock).mockImplementation(() => {
            throw new Error('unexpected failure');
        });

        const service = new DeviceHealthCheckService();
        const device: Device = {
            id: 'device-1',
            name: 'Test Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            useKeyAuth: true,
            isSetup: true,
            createdAt: new Date().toISOString()
        } as Device;

        const result = await service.checkDeviceHealth(device);

        expect(result.isHealthy).toBe(false);
        expect(result.error).toBe('unexpected failure');
        expect(result.device).toBe('Test Device');
    });

    it('handles non-Error rejection values gracefully', async () => {
        (testSSHConnection as jest.Mock).mockRejectedValue('string rejection');

        const service = new DeviceHealthCheckService();
        const device: Device = {
            id: 'device-2',
            name: 'Another Device',
            host: '192.168.1.101',
            username: 'zgx',
            port: 22,
            useKeyAuth: true,
            isSetup: true,
            createdAt: new Date().toISOString()
        } as Device;

        const result = await service.checkDeviceHealth(device);

        expect(result.isHealthy).toBe(false);
        expect(result.error).toBe('string rejection');
    });
});
