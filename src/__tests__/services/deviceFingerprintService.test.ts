/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceFingerprintService } from '../../services/deviceFingerprintService';
import { Device, DeviceFingerprint, DeviceType } from '../../types/devices';
import { executeSSHCommand } from '../../utils/sshConnection';

jest.mock('../../utils/sshConnection', () => ({
    executeSSHCommand: jest.fn()
}));

describe('DeviceFingerprintService', () => {
    const mockExecuteSSHCommand = executeSSHCommand as jest.MockedFunction<typeof executeSSHCommand>;

    const makeDevice = (): Device => ({
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
    });

    const mockSshResponses = (productNameOutput: string): void => {
        mockExecuteSSHCommand
            .mockResolvedValueOnce({
                success: true,
                stdout: productNameOutput,
                stderr: '',
                exitCode: 0
            } as any);
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('device type mapping cases', () => {
        const cases: { name: string; productNameOutput: string; expectedDeviceType: DeviceType }[] = [
            {
                name: 'builds a fingerprint with expected output DeviceType.ZGXNano',
                productNameOutput: 'HP ZGX Nano G1n AI Station',
                expectedDeviceType: DeviceType.ZGXNano
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.ZGXFury',
                productNameOutput: 'HP ZGX Fury G1n AI Station GB300',
                expectedDeviceType: DeviceType.ZGXFury
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Z8',
                productNameOutput: 'HP Z8 Fury G5 Workstation Desktop PC',
                expectedDeviceType: DeviceType.Z8
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Z6',
                productNameOutput: 'HP Z6 G5 A Workstation Desktop PC',
                expectedDeviceType: DeviceType.Z6
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Z4',
                productNameOutput: 'HP Z4 G5 Workstation',
                expectedDeviceType: DeviceType.Z4
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Z2',
                productNameOutput: 'HP Z2 SFF Workstation',
                expectedDeviceType: DeviceType.Z2
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Other due to unknown string',
                productNameOutput: 'Something unexpected',
                expectedDeviceType: DeviceType.Other
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Other due to empty string',
                productNameOutput: '',
                expectedDeviceType: DeviceType.Other
            },
            {
                name: 'builds a fingerprint with expected output DeviceType.Other with Z8 present, but HP missing',
                productNameOutput: 'ASCZ8 blah blah',
                expectedDeviceType: DeviceType.Other
            }
        ];

        for (const testCase of cases) {
            it(testCase.name, async () => {
                const service = new DeviceFingerprintService();
                const device = makeDevice();

                mockSshResponses(testCase.productNameOutput);

                const fingerprint = await service.buildDeviceFingerprint(device);

                expect(fingerprint).toEqual({
                    deviceType: testCase.expectedDeviceType
                });
                expect(mockExecuteSSHCommand).toHaveBeenCalledTimes(1);
            });
        }
    });

    describe('updateDeviceFingerprint (user override)', () => {
        it('user-selected deviceType overwrites the auto-detected value', () => {
            const service = new DeviceFingerprintService();
            const autoDetected: DeviceFingerprint = { deviceType: DeviceType.ZGXNano };

            const updated = service.updateDeviceFingerprint(autoDetected, { deviceType: DeviceType.Z4 });

            expect(updated.deviceType).toBe(DeviceType.Z4);
        });

        it('creates a fingerprint from scratch when there is no existing fingerprint', () => {
            const service = new DeviceFingerprintService();

            const updated = service.updateDeviceFingerprint(undefined, { deviceType: DeviceType.Z2 });

            expect(updated.deviceType).toBe(DeviceType.Z2);
        });
    });

    describe('error cases', () => {
        it('returns fingerprint with unknown deviceType when product_name file does not exist on device', async () => {
            const service = new DeviceFingerprintService();
            const device = makeDevice();

            mockExecuteSSHCommand.mockResolvedValueOnce({
                success: false,
                stdout: '',
                stderr: 'cat: /sys/class/dmi/id/product_name: No such file or directory',
                exitCode: 1
            } as any);

            const fingerprint = await service.buildDeviceFingerprint(device);

            expect(fingerprint).toEqual({ deviceType: DeviceType.Unknown });
            expect(mockExecuteSSHCommand).toHaveBeenCalledTimes(1);
        });

        it('returns fingerprint with unknown deviceType when SSH connection fails', async () => {
            const service = new DeviceFingerprintService();
            const device = makeDevice();

            mockExecuteSSHCommand.mockResolvedValueOnce({
                success: false,
                stdout: '',
                stderr: 'ssh connection error',
                exitCode: 255
            } as any);

            const fingerprint = await service.buildDeviceFingerprint(device);

            expect(fingerprint).toEqual({ deviceType: DeviceType.Unknown });
            expect(mockExecuteSSHCommand).toHaveBeenCalledTimes(1);
        });

        it('returns fingerprint with unknown deviceType when reading product_name is denied', async () => {
            const service = new DeviceFingerprintService();
            const device = makeDevice();

            mockExecuteSSHCommand.mockResolvedValueOnce({
                success: false,
                stdout: '',
                stderr: 'permission denied',
                exitCode: 1
            } as any);

            const fingerprint = await service.buildDeviceFingerprint(device);

            expect(fingerprint).toEqual({ deviceType: DeviceType.Unknown });
            expect(mockExecuteSSHCommand).toHaveBeenCalledTimes(1);
        });
    });
});

