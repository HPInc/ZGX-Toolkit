/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppInstallationService } from '../../services/appInstallationService';
import { Device } from '../../types/devices';
import * as sshConnection from '../../utils/sshConnection';

jest.mock('../../utils/sshConnection');
jest.mock('../../utils/logger');

/**
 * Tests for top-level catch blocks in installApplications()/uninstallApplications(), and for
 * uninstallApplications() code paths (conda-environment removal, apps with no uninstallCommand,
 * uninstallSingleApp's own success/failure/exception branches) that are not exercised by any
 * existing test because none of them pass a real (truthy) progressCallback or select apps that
 * hit the Conda-environment removal path.
 */
describe('AppInstallationService - error paths and uninstall flow edge cases', () => {
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

    describe('installApplications - top-level catch', () => {
        it('returns a failure result when an unexpected error occurs mid-flow', async () => {
            const progressCallback = jest.fn((progress: any) => {
                if (progress.status === 'Preparing installation...') {
                    throw new Error('unexpected progress callback failure');
                }
            });

            // 'uv' has no sudo in its install/uninstall commands, so no password is required.
            const result = await service.installApplications(mockDevice, ['uv'], progressCallback, undefined);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('installation_failed');
            expect(result.message).toBe('unexpected progress callback failure');
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error', message: 'unexpected progress callback failure' })
            );
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });
    });

    describe('uninstallApplications - empty selection', () => {
        it('returns a success result immediately when selectedApps is empty', async () => {
            const result = await service.uninstallApplications(mockDevice, [], undefined, undefined);

            expect(result).toEqual({
                success: true,
                uninstalledApps: [],
                failedApps: [],
                errorType: 'none',
                message: 'No applications to uninstall'
            });
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });
    });

    describe('uninstallApplications - top-level catch', () => {
        it('returns a failure result and notifies via progressCallback when an unexpected error occurs', async () => {
            const progressCallback = jest.fn((progress: any) => {
                if (progress.status === 'Preparing uninstallation...') {
                    throw new Error('unexpected uninstall progress failure');
                }
            });

            const result = await service.uninstallApplications(mockDevice, ['base-system'], progressCallback, undefined);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('uninstallation_failed');
            expect(result.message).toBe('unexpected uninstall progress failure');
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error', message: 'unexpected uninstall progress failure' })
            );
        });
    });

    describe('uninstallApplications - apps with no uninstallCommand', () => {
        it('skips base-system (no uninstallCommand) and still reports overall success, notifying progress start/complete', async () => {
            const progressCallback = jest.fn();

            const result = await service.uninstallApplications(mockDevice, ['base-system'], progressCallback, undefined);

            expect(result.success).toBe(true);
            expect(result.uninstalledApps).toEqual([]);
            expect(result.failedApps).toEqual([]);
            expect(executeSSHCommandMock).not.toHaveBeenCalled();

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'progress', status: 'Preparing uninstallation...' })
            );
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'complete', uninstalledApps: [], failedApps: [] })
            );
        });
    });

    describe('uninstallApplications - Conda environment removal path', () => {
        it('removes the Conda environment and marks dependent Python-tool apps as uninstalled on success', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok('')); // conda env remove succeeds

            const progressCallback = jest.fn();
            const result = await service.uninstallApplications(
                mockDevice,
                ['zgx-python-env', 'jupyter-lab'],
                progressCallback,
                undefined
            );

            expect(result.success).toBe(true);
            expect(result.uninstalledApps).toEqual(expect.arrayContaining(['zgx-python-env', 'jupyter-lab']));
            expect(executeSSHCommandMock).toHaveBeenCalledTimes(1);

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'jupyter-lab', status: 'Completed' })
            );
        });

        it('marks dependent Python-tool apps as failed when Conda environment removal fails', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('conda: command not found')); // conda env remove fails

            const progressCallback = jest.fn();
            const result = await service.uninstallApplications(
                mockDevice,
                ['zgx-python-env', 'jupyter-lab'],
                progressCallback,
                undefined
            );

            // Note: on Conda removal failure, only the *dependent* Python-tool apps are recorded
            // as failed - the zgx-python-env id itself is not added to either list by
            // removeCondaEnvironmentForUninstall's failure branch.
            expect(result.success).toBe(false);
            expect(result.failedApps).toEqual(['jupyter-lab']);

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'jupyter-lab', status: 'Failed' })
            );
        });
    });

    describe('uninstallApplications - uninstallSingleApp full flow (via miniforge, no sudo required)', () => {
        it('reports success when the uninstall command succeeds', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok(''));

            const progressCallback = jest.fn();
            const result = await service.uninstallApplications(mockDevice, ['miniforge'], progressCallback, undefined);

            expect(result.success).toBe(true);
            expect(result.uninstalledApps).toEqual(['miniforge']);
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'progress', currentApp: 'Miniforge' })
            );
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'miniforge', status: 'Completed' })
            );
        });

        it('reports failure when the uninstall command fails', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('rm: permission denied'));

            const progressCallback = jest.fn();
            const result = await service.uninstallApplications(mockDevice, ['miniforge'], progressCallback, undefined);

            expect(result.success).toBe(false);
            expect(result.failedApps).toEqual(['miniforge']);
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'miniforge', status: 'Failed' })
            );
        });

        it('reports failure when the uninstall command throws', async () => {
            executeSSHCommandMock.mockRejectedValueOnce(new Error('ssh connection dropped'));

            const progressCallback = jest.fn();
            const result = await service.uninstallApplications(mockDevice, ['miniforge'], progressCallback, undefined);

            expect(result.success).toBe(false);
            expect(result.failedApps).toEqual(['miniforge']);
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'miniforge', status: 'Failed' })
            );
        });
    });

    describe('uninstallSingleApp (private, invoked directly) - defensive no-uninstallCommand guard', () => {
        it('returns true immediately without calling executeSSHCommand when the app has no uninstallCommand', async () => {
            const appWithNoUninstallCommand: any = {
                id: 'base-system',
                name: 'Base System',
                icon: '🔧',
                description: 'Base system',
                features: [],
                category: 'system-stack',
                installCommand: 'sudo apt install -y base',
                verifyCommand: 'gcc --version',
                uninstallCommand: undefined
            };

            const progressCallback = jest.fn();
            const result = await (service as any).uninstallSingleApp(
                mockDevice,
                appWithNoUninstallCommand,
                1,
                1,
                progressCallback,
                undefined
            );

            expect(result).toBe(true);
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });
    });
});
