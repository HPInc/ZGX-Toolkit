/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppInstallationService } from '../../services/appInstallationService';
import { Device } from '../../types/devices';
import { getAppById } from '../../constants/apps';
import * as sshConnection from '../../utils/sshConnection';

jest.mock('../../utils/sshConnection');
jest.mock('../../utils/logger');

/**
 * Tests for AppInstallationService pre-install check functionality (e.g. the
 * ZRT nvidia-driver check defined in constants/apps.ts).
 *
 * Note: ZRT is distributed as a snap that bundles/dynamically links its own
 * CUDA runtime, so only the NVIDIA driver (nvidia-smi) needs to be validated
 * here - the CUDA *Toolkit* (nvcc) is a build-time dependency for compiling
 * CUDA code and is not required to run pre-built CUDA applications like ZRT.
 */
describe('AppInstallationService - Pre-Install Checks', () => {
    let service: AppInstallationService;
    let mockDevice: Device;
    const executeSSHCommandMock = sshConnection.executeSSHCommand as jest.MockedFunction<typeof sshConnection.executeSSHCommand>;

    beforeEach(() => {
        service = new AppInstallationService();

        mockDevice = {
            id: 'test-device-1',
            name: 'Test ZGX Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            isSetup: true,
            useKeyAuth: false,
            keySetup: {
                keyGenerated: false,
                keyCopied: false,
                connectionTested: false
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        executeSSHCommandMock.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Helper: build a successful SSHCommandResult
    const ok = (stdout = '') => ({ success: true, stdout, stderr: '' } as any);
    const fail = (stderr = 'command not found') => ({ success: false, stdout: '', stderr, error: new Error(stderr) } as any);

    it('zrt app definition should have the expected pre-install checks', () => {
        const zrt = getAppById('zrt');
        expect(zrt?.preInstallChecks).toBeDefined();

        const driverCheck = zrt?.preInstallChecks?.find(c => c.id === 'nvidia-driver-present');
        expect(driverCheck?.severity ?? 'blocking').toBe('blocking');

        // ZRT bundles/links its own CUDA runtime as a snap, so there should be no
        // check requiring the CUDA Toolkit (nvcc) - that's a build-time dependency,
        // not a runtime one, and would incorrectly block installs on devices that
        // only have the driver installed (the normal end-user case).
        expect(zrt?.preInstallChecks?.find(c => c.id === 'nvcc-cuda-toolkit-version')).toBeUndefined();
    });

    it('proceeds with installation when all pre-install checks pass', async () => {
        // Call order for a fresh install of zrt (snapd/base-system already installed):
        // 1. validatePassword ('sudo -S true')
        // 2. verifyAppInstallation(base-system) -> already installed
        // 3. verifyAppInstallation(zrt) -> not installed
        // 4. nvidia-smi check -> success
        // 5. install command -> success
        // 6. verifyAppInstallation(zrt) -> now installed
        executeSSHCommandMock
            .mockResolvedValueOnce(ok('')) // validatePassword
            .mockResolvedValueOnce(ok('base-system installed')) // verify base-system installed
            .mockResolvedValueOnce(fail()) // verify zrt not installed
            .mockResolvedValueOnce(ok('NVIDIA GB10, 580.126.09, 131072 MiB')) // nvidia-smi
            .mockResolvedValueOnce(ok('')) // install command
            .mockResolvedValueOnce(ok('zrt version 1.0.0')); // verify installed

        const progressCallback = jest.fn();
        const result = await service.installApplications(mockDevice, ['zrt'], progressCallback, 'test-password');

        expect(result.success).toBe(true);
        expect(result.installedApps).toContain('zrt');
        expect(result.failedApps).not.toContain('zrt');
        expect(executeSSHCommandMock).toHaveBeenCalledTimes(6);
    });

    it('fails installation when the blocking nvidia driver check fails', async () => {
        executeSSHCommandMock
            .mockResolvedValueOnce(ok('')) // validatePassword
            .mockResolvedValueOnce(ok('base-system installed')) // verify base-system installed
            .mockResolvedValueOnce(fail()) // verify zrt not installed
            .mockResolvedValueOnce(fail('nvidia-smi: command not found')); // nvidia-smi fails -> blocking

        const progressCallback = jest.fn();
        const result = await service.installApplications(mockDevice, ['zrt'], progressCallback, 'test-password');

        expect(result.success).toBe(false);
        expect(result.failedApps).toContain('zrt');
        expect(result.installedApps).not.toContain('zrt');

        // The install command itself should never have been executed since the
        // blocking check should abort before reaching it.
        expect(executeSSHCommandMock).toHaveBeenCalledTimes(4);

        // The failMessage should have been surfaced via the progress callback.
        const statusMessages = progressCallback.mock.calls.map(([arg]) => arg.status).filter(Boolean);
        expect(statusMessages.some(msg => msg.includes('NVIDIA GPU driver'))).toBe(true);

        // The failMessage should also be captured in failureReasons so it can be
        // surfaced on the final Application Install Complete screen.
        expect(result.failureReasons?.['zrt']).toContain('NVIDIA GPU driver');
    });

    it('proceeds with installation (with a warning) when a warning-severity pre-install check fails', async () => {
        // Since all of ZRT's real pre-install checks are currently 'blocking', this test
        // exercises the warning-severity code path directly using a synthetic app definition,
        // ensuring that path continues to work correctly regardless of what checks are
        // currently configured for any given app.
        const appWithWarningCheck = {
            id: 'synthetic-app',
            name: 'Synthetic App',
            icon: '🧪',
            description: 'Synthetic app for testing warning-severity pre-install checks',
            features: [],
            category: 'system-stack',
            installCommand: 'sudo apt install -y synthetic-app',
            verifyCommand: 'synthetic-app --version',
            preInstallChecks: [
                {
                    id: 'synthetic-warning-check',
                    description: 'A synthetic warning-severity check',
                    command: 'some-optional-tool --version',
                    minVersion: '1.0',
                    severity: 'warning' as const,
                    failMessage: 'Optional tool version could not be verified or is out of date.'
                }
            ]
        };

        executeSSHCommandMock
            .mockResolvedValueOnce(fail()) // verify synthetic-app not installed
            .mockResolvedValueOnce(fail('some-optional-tool: command not found')) // warning check fails
            .mockResolvedValueOnce(ok('')) // install command still runs
            .mockResolvedValueOnce(ok('synthetic-app v1.2.3')); // verify installed

        const progressCallback = jest.fn();
        const { success: passed } = await (service as any).installSingleApp(
            mockDevice,
            appWithWarningCheck,
            1,
            1,
            progressCallback,
            undefined
        );

        expect(passed).toBe(true);

        // The warning failMessage should have been surfaced via the progress callback,
        // but installation should not have been aborted.
        const statusMessages = progressCallback.mock.calls.map((args: any) => args[0].status).filter(Boolean);
        expect(statusMessages.some((msg: string) => msg.includes('Optional tool version'))).toBe(true);
        expect(executeSSHCommandMock).toHaveBeenCalledTimes(4);
    });

    it('treats a pre-install check that throws as a failed check', async () => {
        executeSSHCommandMock
            .mockResolvedValueOnce(ok('')) // validatePassword
            .mockResolvedValueOnce(ok('base-system installed')) // verify base-system installed
            .mockResolvedValueOnce(fail()) // verify zrt not installed
            .mockRejectedValueOnce(new Error('SSH connection lost')); // nvidia-smi throws

        const progressCallback = jest.fn();
        const result = await service.installApplications(mockDevice, ['zrt'], progressCallback, 'test-password');

        expect(result.success).toBe(false);
        expect(result.failedApps).toContain('zrt');
    });

    it('surfaces a warning and proceeds when a warning-severity pre-install check throws', async () => {
        const appWithWarningCheck: any = {
            id: 'synthetic-app',
            name: 'Synthetic App',
            icon: '🧪',
            description: 'Synthetic app for testing warning-severity pre-install checks that throw',
            features: [],
            category: 'system-stack',
            installCommand: 'sudo apt install -y synthetic-app',
            verifyCommand: 'synthetic-app --version',
            preInstallChecks: [
                {
                    id: 'synthetic-warning-check',
                    description: 'A synthetic warning-severity check that throws',
                    command: 'some-optional-tool --version',
                    severity: 'warning' as const,
                    failMessage: 'Optional tool could not be checked.'
                }
            ]
        };

        executeSSHCommandMock
            .mockResolvedValueOnce(fail()) // verify synthetic-app not installed
            .mockRejectedValueOnce(new Error('SSH connection lost')) // warning check throws
            .mockResolvedValueOnce(ok('')) // install command still runs
            .mockResolvedValueOnce(ok('synthetic-app v1.2.3')); // verify installed

        const progressCallback = jest.fn();
        const { success: passed } = await (service as any).installSingleApp(
            mockDevice,
            appWithWarningCheck,
            1,
            1,
            progressCallback,
            undefined
        );

        expect(passed).toBe(true);

        const statusMessages = progressCallback.mock.calls.map((args: any) => args[0].status).filter(Boolean);
        expect(statusMessages.some((msg: string) => msg.includes('Optional tool could not be checked'))).toBe(true);
        expect(executeSSHCommandMock).toHaveBeenCalledTimes(4);
    });
});

/**
 * Tests for ZRT's verifyCommand 
 */
describe('AppInstallationService - ZRT verifyCommand hardening', () => {
    let service: AppInstallationService;
    let mockDevice: Device;
    const executeSSHCommandMock = sshConnection.executeSSHCommand as jest.MockedFunction<typeof sshConnection.executeSSHCommand>;

    const ok = (stdout = '') => ({ success: true, stdout, stderr: '' } as any);
    const fail = (stderr = 'command not found') => ({ success: false, stdout: '', stderr, error: new Error(stderr) } as any);

    beforeEach(() => {
        service = new AppInstallationService();

        mockDevice = {
            id: 'test-device-1',
            name: 'Test ZGX Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            isSetup: true,
            useKeyAuth: false,
            keySetup: {
                keyGenerated: false,
                keyCopied: false,
                connectionTested: false
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        executeSSHCommandMock.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('sends the combined snap list + explicit-path version command to the device', async () => {
        const zrt = getAppById('zrt')!;
        executeSSHCommandMock.mockResolvedValueOnce(ok('zrt   1.0.0   123   latest/stable   -'));

        await service.verifyAppInstallation(mockDevice, zrt);

        expect(executeSSHCommandMock).toHaveBeenCalledWith(
            mockDevice,
            'snap list zrt && /snap/bin/zrt version',
            expect.anything(),
            expect.anything()
        );
    });

    it('reports installed when both the snap is registered and the binary runs successfully', async () => {
        const zrt = getAppById('zrt')!;
        executeSSHCommandMock.mockResolvedValueOnce(ok('zrt   1.0.0   123   latest/stable   -\nzrt version 1.0.0'));

        const result = await service.verifyAppInstallation(mockDevice, zrt);

        expect(result.isInstalled).toBe(true);
    });

    it('reports not installed when the snap is not registered at all (real negative)', async () => {
        const zrt = getAppById('zrt')!;
        executeSSHCommandMock.mockResolvedValueOnce(fail('error: no matching snaps installed'));

        const result = await service.verifyAppInstallation(mockDevice, zrt);

        expect(result.isInstalled).toBe(false);
        expect(result.detail).toContain('no matching snaps installed');
    });

    it('reports not installed when the snap is registered but broken/fails to execute (avoids the false positive a plain "snap list zrt" check would produce)', async () => {
        const zrt = getAppById('zrt')!;
        // Simulates: 'snap list zrt' succeeds (entry exists) but '&&  /snap/bin/zrt version'
        // fails (broken revision/mount error), so the overall shell command's exit code is
        // non-zero and executeSSHCommand reports failure.
        executeSSHCommandMock.mockResolvedValueOnce(fail('/snap/bin/zrt: error while loading shared libraries'));

        const result = await service.verifyAppInstallation(mockDevice, zrt);

        expect(result.isInstalled).toBe(false);
        expect(result.detail).toContain('error while loading shared libraries');
    });

    it('is unaffected by a stale /usr/local/bin/zrt shadowing the snap in PATH, since it invokes the binary via its explicit /snap/bin path', async () => {
        const zrt = getAppById('zrt')!;

        expect(zrt.verifyCommand).not.toBe('zrt version');
        expect(zrt.verifyCommand).toContain('/snap/bin/zrt version');
    });
});
