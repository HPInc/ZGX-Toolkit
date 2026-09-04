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
 * Tests for the private helper methods extracted from installApplications()/installSingleApp()
 * during the cognitive-complexity refactor (validateSudoRequirements, installBaseSystemIfNeeded,
 * installAppsInOrder, reportAlreadyInstalled, enforcePreInstallChecks, runInstallCommand,
 * finalizeInstallResult), plus edge cases for extractVersion/compareVersions.
 */
describe('AppInstallationService - refactored helper methods', () => {
    let service: AppInstallationService;
    let mockDevice: Device;
    const executeSSHCommandMock = sshConnection.executeSSHCommand as jest.MockedFunction<typeof sshConnection.executeSSHCommand>;

    const ok = (stdout = '') => ({ success: true, stdout, stderr: '' } as any);
    const fail = (stderr = 'command not found') => ({ success: false, stdout: '', stderr, error: new Error(stderr) } as any);

    const baseApp = (overrides: Partial<any> = {}) => ({
        id: 'synthetic-app',
        name: 'Synthetic App',
        icon: '🧪',
        description: 'Synthetic app for testing',
        features: [],
        category: 'system-stack',
        installCommand: 'apt install -y synthetic-app',
        verifyCommand: 'synthetic-app --version',
        ...overrides
    });

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

    describe('validateSudoRequirements', () => {
        it('returns undefined (no error) when no app requires sudo', async () => {
            const apps = [baseApp({ installCommand: 'echo hello' })];
            const result = await (service as any).validateSudoRequirements(mockDevice, apps, ['synthetic-app'], undefined);
            expect(result).toBeUndefined();
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('returns a SUDO_PASSWORD_REQUIRED error when sudo is required but no password given', async () => {
            const apps = [baseApp({ installCommand: 'sudo apt install -y synthetic-app' })];
            const result = await (service as any).validateSudoRequirements(mockDevice, apps, ['synthetic-app'], undefined);

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.failedApps).toEqual(['synthetic-app']);
        });

        it('returns an INVALID_PASSWORD error when the sudo password is rejected', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('sudo: incorrect password'));

            const apps = [baseApp({ installCommand: 'sudo apt install -y synthetic-app' })];
            const result = await (service as any).validateSudoRequirements(mockDevice, apps, ['synthetic-app'], 'wrong-password');

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('invalid_password');
            expect(result.message).toBe(AppInstallationService.invalidPasswordMessage);
        });

        it('returns undefined when sudo is required and the password is valid', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok(''));

            const apps = [baseApp({ installCommand: 'sudo apt install -y synthetic-app' })];
            const result = await (service as any).validateSudoRequirements(mockDevice, apps, ['synthetic-app'], 'correct-password');

            expect(result).toBeUndefined();
            expect(executeSSHCommandMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('installBaseSystemIfNeeded', () => {
        it('does nothing when there is no base-system app definition', async () => {
            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installBaseSystemIfNeeded(
                mockDevice, [], [], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual([]);
            expect(accumulator.failedApps).toEqual([]);
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('skips installation when base-system is already installed', async () => {
            const baseSystemApp = baseApp({ id: 'base-system', name: 'Base System' });
            executeSSHCommandMock.mockResolvedValueOnce(ok('already installed')); // verifyAppInstallation -> true

            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installBaseSystemIfNeeded(
                mockDevice, [baseSystemApp], [], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual([]);
            expect(accumulator.failedApps).toEqual([]);
            expect(executeSSHCommandMock).toHaveBeenCalledTimes(1);
        });

        it('installs base-system and records success when not already installed', async () => {
            const baseSystemApp = baseApp({ id: 'base-system', name: 'Base System', installCommand: 'apt install -y base' });
            executeSSHCommandMock
                .mockResolvedValueOnce(fail()) // outer verifyAppInstallation (in installBaseSystemIfNeeded) -> not installed
                .mockResolvedValueOnce(fail()) // inner verifyAppInstallation (in installSingleApp) -> not installed
                .mockResolvedValueOnce(ok('')) // install command
                .mockResolvedValueOnce(ok('base installed')); // verify after install

            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installBaseSystemIfNeeded(
                mockDevice, [baseSystemApp], [], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual(['base-system']);
            expect(accumulator.failedApps).toEqual([]);
        });

        it('records failure and failureReason when base-system install fails', async () => {
            const baseSystemApp = baseApp({ id: 'base-system', name: 'Base System', installCommand: 'apt install -y base' });
            executeSSHCommandMock
                .mockResolvedValueOnce(fail()) // outer verifyAppInstallation (in installBaseSystemIfNeeded) -> not installed
                .mockResolvedValueOnce(fail()) // inner verifyAppInstallation (in installSingleApp) -> not installed
                .mockResolvedValueOnce(fail('apt: broken pipe')); // install command fails

            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installBaseSystemIfNeeded(
                mockDevice, [baseSystemApp], [], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual([]);
            expect(accumulator.failedApps).toEqual(['base-system']);
            expect(accumulator.failureReasons['base-system']).toContain('apt: broken pipe');
        });
    });

    describe('installAppsInOrder', () => {
        it('records both successes and failures across multiple apps', async () => {
            const appA = baseApp({ id: 'app-a', name: 'App A', installCommand: 'apt install -y app-a' });
            const appB = baseApp({ id: 'app-b', name: 'App B', installCommand: 'apt install -y app-b' });

            executeSSHCommandMock
                // app-a: not installed, install succeeds, verify succeeds
                .mockResolvedValueOnce(fail())
                .mockResolvedValueOnce(ok(''))
                .mockResolvedValueOnce(ok('app-a installed'))
                // app-b: not installed, install fails
                .mockResolvedValueOnce(fail())
                .mockResolvedValueOnce(fail('install failed for app-b'));

            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installAppsInOrder(
                mockDevice, [appA, appB], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual(['app-a']);
            expect(accumulator.failedApps).toEqual(['app-b']);
            expect(accumulator.failureReasons['app-b']).toContain('install failed for app-b');
        });

        it('does nothing when given an empty app list', async () => {
            const accumulator = { newlyInstalled: [] as string[], failedApps: [] as string[], failureReasons: {} as Record<string, string> };

            await (service as any).installAppsInOrder(
                mockDevice, [], jest.fn(), undefined, accumulator
            );

            expect(accumulator.newlyInstalled).toEqual([]);
            expect(accumulator.failedApps).toEqual([]);
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });
    });

    describe('reportAlreadyInstalled', () => {
        it('reports success and sends appropriate progress callbacks', () => {
            const progressCallback = jest.fn();
            const app = baseApp();

            const result = (service as any).reportAlreadyInstalled(app, 50, progressCallback);

            expect(result).toEqual({ success: true });
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'synthetic-app', status: 'Completed' })
            );
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'progress', status: expect.stringContaining('already installed') })
            );
        });
    });

    describe('enforcePreInstallChecks', () => {
        it('returns undefined immediately when the app has no pre-install checks', async () => {
            const app = baseApp({ preInstallChecks: undefined });
            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, jest.fn());
            expect(result).toBeUndefined();
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('returns undefined immediately when preInstallChecks is an empty array', async () => {
            const app = baseApp({ preInstallChecks: [] });
            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, jest.fn());
            expect(result).toBeUndefined();
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('returns a failure result with failureReason when a blocking check fails', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('driver missing'));

            const app = baseApp({
                preInstallChecks: [{
                    id: 'check-1',
                    description: 'test check',
                    command: 'some-tool --version',
                    severity: 'blocking' as const,
                    failMessage: 'Some tool is required.'
                }]
            });

            const progressCallback = jest.fn();
            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, progressCallback);

            expect(result).toEqual({ success: false, failureReason: 'Some tool is required.' });
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'synthetic-app', status: 'Failed' })
            );
        });

        it('returns undefined and surfaces a warning when a warning-severity check fails', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('optional tool missing'));

            const app = baseApp({
                preInstallChecks: [{
                    id: 'check-1',
                    description: 'test check',
                    command: 'optional-tool --version',
                    severity: 'warning' as const,
                    failMessage: 'Optional tool missing, proceeding anyway.'
                }]
            });

            const progressCallback = jest.fn();
            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, progressCallback);

            expect(result).toBeUndefined();
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'progress', status: 'Optional tool missing, proceeding anyway.' })
            );
        });

        it('omits the parenthetical detail when the failed check produced no stderr/error message', async () => {
            executeSSHCommandMock.mockResolvedValueOnce({ success: false, stdout: '', stderr: '' } as any);

            const app = baseApp({
                preInstallChecks: [{
                    id: 'check-1',
                    description: 'test check',
                    command: 'some-tool --version',
                    severity: 'blocking' as const,
                    failMessage: 'Some tool is required.'
                }]
            });

            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, jest.fn());

            expect(result).toEqual({ success: false, failureReason: 'Some tool is required.' });
        });

        it('appends the thrown error message when a check throws instead of resolving', async () => {
            executeSSHCommandMock.mockRejectedValueOnce(new Error('SSH connection lost'));

            const app = baseApp({
                preInstallChecks: [{
                    id: 'check-1',
                    description: 'test check',
                    command: 'some-tool --version',
                    severity: 'blocking' as const,
                    failMessage: 'Some tool is required.'
                }]
            });

            const result = await (service as any).enforcePreInstallChecks(mockDevice, app, 0, jest.fn());

            expect(result).toEqual({ success: false, failureReason: 'Some tool is required.' });
        });
    });

    describe('runInstallCommand', () => {
        it('runs the install command as-is when sudo is not required', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok(''));
            const app = baseApp({ installCommand: 'apt install -y synthetic-app' });

            await (service as any).runInstallCommand(mockDevice, app, undefined);

            expect(executeSSHCommandMock).toHaveBeenCalledWith(
                mockDevice,
                'apt install -y synthetic-app',
                expect.any(Object),
                expect.objectContaining({ operationName: app.name })
            );
        });

        it('wraps the command in sudo -S bash -c when sudo is required and a password is provided', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok(''));
            const app = baseApp({ installCommand: 'sudo apt install -y synthetic-app' });

            await (service as any).runInstallCommand(mockDevice, app, 'my-password');

            const [, command] = executeSSHCommandMock.mock.calls[0];
            expect(command).toMatch(/^sudo -S bash -c /);
            expect(command).not.toContain('sudo apt install'); // inner sudo stripped
        });

        it('runs the raw command (still containing sudo) when sudo is required but no password is provided', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('sudo: a password is required'));
            const app = baseApp({ installCommand: 'sudo apt install -y synthetic-app' });

            await (service as any).runInstallCommand(mockDevice, app, undefined);

            const [, command] = executeSSHCommandMock.mock.calls[0];
            expect(command).toBe('sudo apt install -y synthetic-app');
        });
    });

    describe('finalizeInstallResult', () => {
        it('returns success when the install command succeeded and verification passes', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok('synthetic-app v1.0'));
            const app = baseApp();

            const result = await (service as any).finalizeInstallResult(mockDevice, app, ok(''), jest.fn());

            expect(result).toEqual({ success: true });
        });

        it('returns a failure with failureReason when the install command itself failed', async () => {
            const app = baseApp();
            const failedResult = fail('E: Unable to locate package');

            const result = await (service as any).finalizeInstallResult(mockDevice, app, failedResult, jest.fn());

            expect(result.success).toBe(false);
            expect(result.failureReason).toContain('E: Unable to locate package');
            // Should not call verifyAppInstallation when the install command already failed
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('returns a failure with a verification-specific failureReason when install succeeds but verification fails', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail()); // verifyAppInstallation -> false
            const app = baseApp();

            const result = await (service as any).finalizeInstallResult(mockDevice, app, ok(''), jest.fn());

            expect(result.success).toBe(false);
            expect(result.failureReason).toContain('could not be verified as installed');
        });
    });

    describe('extractVersion / compareVersions (via evaluatePreInstallCheck)', () => {
        const evaluate = (result: any, output: string, check: any) =>
            (service as any).evaluatePreInstallCheck(result, output, check);

        it('passes when detected version equals minVersion', () => {
            const check = { id: 'v', description: '', command: '', minVersion: '12.8', failMessage: '' };
            const passed = evaluate(ok(), 'release 12.8, V12.8.61', check);
            expect(passed).toBe(true);
        });

        it('passes when detected version exceeds minVersion', () => {
            const check = { id: 'v', description: '', command: '', minVersion: '12.8', failMessage: '' };
            const passed = evaluate(ok(), 'release 13.0', check);
            expect(passed).toBe(true);
        });

        it('fails when detected version is below minVersion', () => {
            const check = { id: 'v', description: '', command: '', minVersion: '12.8', failMessage: '' };
            const passed = evaluate(ok(), 'release 11.8', check);
            expect(passed).toBe(false);
        });

        it('fails when no version-like string can be found in the output', () => {
            const check = { id: 'v', description: '', command: '', minVersion: '12.8', failMessage: '' };
            const passed = evaluate(ok(), 'command not found', check);
            expect(passed).toBe(false);
        });

        it('handles version strings with differing segment counts correctly (e.g. 12.10 > 12.9)', () => {
            const check = { id: 'v', description: '', command: '', minVersion: '12.9', failMessage: '' };
            const passed = evaluate(ok(), 'version 12.10.2', check);
            expect(passed).toBe(true);
        });

        it('passes with no minVersion as long as the command succeeded', () => {
            const check = { id: 'v', description: '', command: '', failMessage: '' };
            const passed = evaluate(ok('anything'), 'anything', check);
            expect(passed).toBe(true);
        });

        it('fails immediately when the underlying command result was not successful, regardless of output', () => {
            const check = { id: 'v', description: '', command: '', failMessage: '' };
            const passed = evaluate(fail(), 'irrelevant', check);
            expect(passed).toBe(false);
        });
    });

    describe('validateUninstallSudoRequirements', () => {
        it('returns null (no error) when no app requires sudo', async () => {
            const apps = [baseApp({ uninstallCommand: 'echo bye' })];
            const result = await (service as any).validateUninstallSudoRequirements(mockDevice, apps, ['synthetic-app'], undefined);
            expect(result).toBeNull();
            expect(executeSSHCommandMock).not.toHaveBeenCalled();
        });

        it('returns a SUDO_PASSWORD_REQUIRED error when sudo is required but no password given', async () => {
            const apps = [baseApp({ uninstallCommand: 'sudo apt remove -y synthetic-app' })];
            const result = await (service as any).validateUninstallSudoRequirements(mockDevice, apps, ['synthetic-app'], undefined);

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.failedApps).toEqual(['synthetic-app']);
        });

        it('returns an INVALID_PASSWORD error when the sudo password is rejected', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(fail('sudo: incorrect password'));

            const apps = [baseApp({ uninstallCommand: 'sudo apt remove -y synthetic-app' })];
            const result = await (service as any).validateUninstallSudoRequirements(mockDevice, apps, ['synthetic-app'], 'wrong-password');

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('invalid_password');
            expect(result.message).toBe(AppInstallationService.invalidPasswordMessage);
        });

        it('returns null when sudo is required and the password is valid', async () => {
            executeSSHCommandMock.mockResolvedValueOnce(ok(''));

            const apps = [baseApp({ uninstallCommand: 'sudo apt remove -y synthetic-app' })];
            const result = await (service as any).validateUninstallSudoRequirements(mockDevice, apps, ['synthetic-app'], 'correct-password');

            expect(result).toBeNull();
            expect(executeSSHCommandMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('verifyAppInstallation - exception handling', () => {
        it('returns isInstalled: false and logs when executeSSHCommand throws', async () => {
            executeSSHCommandMock.mockRejectedValueOnce(new Error('SSH connection lost'));

            const app = baseApp();
            const result = await service.verifyAppInstallation(mockDevice, app);

            expect(result).toEqual({ isInstalled: false, detail: 'SSH connection lost' });
        });
    });

    describe('installSingleApp - exception handling', () => {
        it('returns a failure result when the install command execution throws after the not-installed check', async () => {
            executeSSHCommandMock
                .mockResolvedValueOnce(fail()) // verifyAppInstallation -> not installed
                .mockRejectedValueOnce(new Error('SSH connection reset')); // runInstallCommand -> throws

            const app = baseApp();
            const progressCallback = jest.fn();
            const result = await (service as any).installSingleApp(mockDevice, app, 1, 1, progressCallback, undefined);

            expect(result.success).toBe(false);
            expect(result.failureReason).toBe('SSH connection reset');
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appStatus', appId: 'synthetic-app', status: 'Failed' })
            );
        });
    });
});
