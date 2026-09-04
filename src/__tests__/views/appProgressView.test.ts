/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppProgressViewController } from '../../views/apps/progress/appProgressViewController';
import { AppCompleteViewController } from '../../views/apps/complete/appCompleteViewController';
import { AppSelectionViewController } from '../../views/apps/selection/appSelectionViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { AppInstallationService, PasswordService, DeviceService } from '../../services';
import { Device } from '../../types/devices';

describe('AppProgressViewController', () => {
    let view: AppProgressViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockAppInstallationService: jest.Mocked<AppInstallationService>;
    let mockPasswordService: jest.Mocked<PasswordService>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockMessageCallback: jest.Mock;
    let mockNavigationCallback: jest.Mock;

    const mockDevice: Device = {
        id: 'device-1',
        name: 'Test Device',
        host: '192.168.1.100',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: {
            keyGenerated: true,
            keyCopied: true,
            connectionTested: true
        },
        createdAt: '2025-01-01T00:00:00Z'
    };

    beforeEach(() => {
        jest.useFakeTimers();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn()
        } as any;

        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockAppInstallationService = {
            sortAppsByDependencies: jest.fn((apps) => apps),
            sortAppsForUninstallation: jest.fn((apps) => apps),
            installApplications: jest.fn().mockResolvedValue({
                success: true,
                installedApps: [],
                failedApps: []
            }),
            uninstallApplications: jest.fn().mockResolvedValue({
                success: true,
                uninstalledApps: [],
                failedApps: []
            }),
            validatePassword: jest.fn().mockResolvedValue(true)
        } as any;

        mockPasswordService = {
            promptForPassword: jest.fn()
        } as any;

        mockDeviceService = {
            updateDevice: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockMessageCallback = jest.fn();
        mockNavigationCallback = jest.fn().mockResolvedValue(undefined);

        view = new AppProgressViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            appInstallationService: mockAppInstallationService,
            passwordService: mockPasswordService,
            deviceService: mockDeviceService
        });

        view.setMessageCallback(mockMessageCallback);
        view.setNavigationCallback(mockNavigationCallback);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(AppProgressViewController.viewId()).toBe('apps/progress');
        });
    });

    describe('render', () => {
        it('should throw error when no device is provided', async () => {
            await expect(view.render()).rejects.toThrow('device required for app progress view');
            expect(mockLogger.error).toHaveBeenCalledWith('No device provided to app progress view');
        });

        it('should render with selectedApps "all" and default to install operation', async () => {
            const html = await view.render({
                device: mockDevice,
                selectedApps: 'all'
            } as any);

            expect(html).toContain('Test Device');
            expect(html).toContain('Application Install');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'apps.progress'
                }
            });

            // "all" selection includes sudo-requiring apps, so a password prompt should be scheduled.
            await jest.advanceTimersByTimeAsync(100);
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
            expect(mockAppInstallationService.installApplications).not.toHaveBeenCalled();
        });

        it('should render a specific app list for install without requiring sudo', async () => {
            const html = await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            expect(html).toContain('uv');
            expect(mockAppInstallationService.sortAppsByDependencies).toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(100);

            // No sudo required, so installation should start immediately.
            expect(mockAppInstallationService.installApplications).toHaveBeenCalledWith(
                mockDevice,
                ['uv'],
                expect.any(Function),
                undefined
            );
            expect(mockMessageCallback).not.toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
        });

        it('should render a specific app list for uninstall requiring sudo', async () => {
            const html = await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['podman']
            });

            expect(html).toContain('Application Uninstall');
            expect(mockAppInstallationService.sortAppsForUninstallation).toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(100);

            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
            expect(mockAppInstallationService.uninstallApplications).not.toHaveBeenCalled();
        });

        it('should start uninstallation immediately when no sudo is required', async () => {
            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockAppInstallationService.uninstallApplications).toHaveBeenCalledWith(
                mockDevice,
                ['uv'],
                expect.any(Function),
                undefined
            );
        });

        it('should show the ZRT uninstall warning and hide the app list on a full uninstall', async () => {
            const html = await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: 'all'
            } as any);

            expect(html).toContain('Uninstalling HP Z Runtime will not stop any models');
            expect(html).not.toContain('Uninstall Queue');
        });

        it('should not show the ZRT uninstall warning for a partial uninstall', async () => {
            const html = await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            expect(html).not.toContain('Uninstalling HP Z Runtime will not stop any models');
        });

        it('should use a zrtLogoUri for the zrt app icon when provided', async () => {
            const html = await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['zrt'],
                zrtLogoUri: 'https://example.com/zrt-logo.png'
            });

            expect(html).toContain('https://example.com/zrt-logo.png');
        });
    });

    describe('operation lifecycle - install', () => {
        it('should complete installation successfully and navigate to the complete view', async () => {
            mockAppInstallationService.installApplications.mockImplementation(async (_device, _apps, progressCallback) => {
                progressCallback?.({ type: 'progress', appId: 'uv', status: 'installing' });
                return {
                    success: true,
                    installedApps: ['uv'],
                    failedApps: []
                };
            });

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'progress', appId: 'uv', status: 'installing' });
            expect(mockDevice.appSetupComplete).toBe(true);
            expect(mockDeviceService.updateDevice).toHaveBeenCalledWith('device-1', mockDevice);
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                AppCompleteViewController.viewId(),
                {
                    device: mockDevice,
                    installedApps: ['uv'],
                    failedApps: [],
                    failureReasons: undefined,
                    operation: 'install'
                },
                undefined
            );
        });

        it('should navigate to the complete view with failure details when installation fails', async () => {
            mockAppInstallationService.installApplications.mockResolvedValue({
                success: false,
                installedApps: [],
                failedApps: ['uv'],
                message: 'boom',
                failureReasons: { uv: 'network error' }
            });

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Installation failed', {
                message: 'boom',
                failedApps: ['uv']
            });
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                AppCompleteViewController.viewId(),
                {
                    device: mockDevice,
                    installedApps: [],
                    failedApps: ['uv'],
                    failureReasons: { uv: 'network error' },
                    operation: 'install'
                },
                undefined
            );
        });

        it('should send an error progress update when installApplications throws an Error', async () => {
            mockAppInstallationService.installApplications.mockRejectedValue(new Error('ssh failure'));

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Installation error', { error: 'ssh failure' });
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'error', message: 'ssh failure' });
        });

        it('should fall back to a generic error message when a non-Error is thrown', async () => {
            mockAppInstallationService.installApplications.mockRejectedValue('raw string failure');

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Installation error', { error: 'raw string failure' });
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'error', message: 'Installation failed' });
        });
    });

    describe('operation lifecycle - uninstall', () => {
        it('should complete uninstallation and mark appSetupComplete false when all apps removed', async () => {
            mockAppInstallationService.uninstallApplications.mockImplementation(async (_device, _apps, progressCallback) => {
                progressCallback?.({ type: 'progress', appId: 'uv', status: 'uninstalling' });
                return {
                    success: true,
                    uninstalledApps: ['uv'],
                    failedApps: []
                };
            });

            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'progress', appId: 'uv', status: 'uninstalling' });
            expect(mockDevice.appSetupComplete).toBe(false);
            expect(mockDeviceService.updateDevice).toHaveBeenCalledWith('device-1', mockDevice);
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                AppCompleteViewController.viewId(),
                {
                    device: mockDevice,
                    installedApps: ['uv'],
                    failedApps: [],
                    operation: 'uninstall'
                },
                undefined
            );
        });

        it('should not touch appSetupComplete when only some selected apps were uninstalled', async () => {
            mockDevice.appSetupComplete = true;
            mockAppInstallationService.uninstallApplications.mockResolvedValue({
                success: true,
                uninstalledApps: ['uv'],
                failedApps: []
            });

            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv', 'poetry']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockDevice.appSetupComplete).toBe(true);
        });

        it('should navigate to the complete view with failure details when uninstallation fails', async () => {
            mockAppInstallationService.uninstallApplications.mockResolvedValue({
                success: false,
                uninstalledApps: [],
                failedApps: ['uv'],
                message: 'boom'
            });

            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Uninstallation failed', {
                message: 'boom',
                failedApps: ['uv']
            });
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                AppCompleteViewController.viewId(),
                {
                    device: mockDevice,
                    installedApps: [],
                    failedApps: ['uv'],
                    operation: 'uninstall'
                },
                undefined
            );
        });

        it('should send an error progress update when uninstallApplications throws', async () => {
            mockAppInstallationService.uninstallApplications.mockRejectedValue(new Error('disk full'));

            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Uninstallation error', { error: 'disk full' });
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'error', message: 'disk full' });
        });

        it('should fall back to a generic error message when a non-Error is thrown during uninstallation', async () => {
            mockAppInstallationService.uninstallApplications.mockRejectedValue('raw string failure');

            await view.render({
                device: mockDevice,
                operation: 'uninstall',
                selectedApps: ['uv']
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(mockLogger.error).toHaveBeenCalledWith('Uninstallation error', { error: 'raw string failure' });
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'error', message: 'Uninstallation failed' });
        });
    });

    describe('handleMessage', () => {
        it('should log unhandled message types', async () => {
            await view.handleMessage({ type: 'some-other-type' } as any);

            expect(mockLogger.debug).toHaveBeenCalledWith('Unhandled message type in app install', { type: 'some-other-type' });
        });

        it('should navigate back to app selection on cancel when a device is set', async () => {
            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['uv']
            });

            await view.handleMessage({ type: 'cancel' } as any);

            expect(mockNavigationCallback).toHaveBeenCalledWith(
                AppSelectionViewController.viewId(),
                { device: mockDevice },
                undefined
            );
        });

        it('should not navigate on cancel when no device has been set', async () => {
            await view.handleMessage({ type: 'cancel' } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
        });

        it('should validate the password successfully and start the deferred operation', async () => {
            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['podman']
            });

            // Drain the initial deferred timer so it doesn't race with the explicit validation below.
            await jest.advanceTimersByTimeAsync(100);
            mockMessageCallback.mockClear();

            await view.handleMessage({ type: 'validatePassword', password: 'secret' } as any);

            expect(mockAppInstallationService.validatePassword).toHaveBeenCalledWith(mockDevice, 'secret');
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'passwordValidationResult', valid: true });
            expect(mockAppInstallationService.installApplications).toHaveBeenCalledWith(
                mockDevice,
                ['podman'],
                expect.any(Function),
                'secret'
            );
        });

        it('should report failed password validation without starting the operation', async () => {
            mockAppInstallationService.validatePassword.mockResolvedValue(false);

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['podman']
            });
            await jest.advanceTimersByTimeAsync(100);
            mockMessageCallback.mockClear();

            await view.handleMessage({ type: 'validatePassword', password: 'wrong' } as any);

            expect(mockLogger.warn).toHaveBeenCalledWith('Password validation failed');
            expect(mockMessageCallback).toHaveBeenCalledWith({ type: 'passwordValidationResult', valid: false });
            expect(mockAppInstallationService.installApplications).not.toHaveBeenCalled();
        });

        it('should report an error message when password validation throws an Error', async () => {
            mockAppInstallationService.validatePassword.mockRejectedValue(new Error('network down'));

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['podman']
            });
            await jest.advanceTimersByTimeAsync(100);
            mockMessageCallback.mockClear();

            await view.handleMessage({ type: 'validatePassword', password: 'secret' } as any);

            expect(mockLogger.error).toHaveBeenCalledWith('Error during password validation', { error: 'network down' });
            expect(mockMessageCallback).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: false,
                error: 'network down'
            });
        });

        it('should fall back to a generic validation error message for a non-Error rejection', async () => {
            mockAppInstallationService.validatePassword.mockRejectedValue('raw rejection');

            await view.render({
                device: mockDevice,
                operation: 'install',
                selectedApps: ['podman']
            });
            await jest.advanceTimersByTimeAsync(100);
            mockMessageCallback.mockClear();

            await view.handleMessage({ type: 'validatePassword', password: 'secret' } as any);

            expect(mockMessageCallback).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: false,
                error: 'Validation error'
            });
        });

        it('should do nothing when validating a password with no device set', async () => {
            await view.handleMessage({ type: 'validatePassword', password: 'secret' } as any);

            expect(mockLogger.error).toHaveBeenCalledWith('No device available for password validation');
            expect(mockAppInstallationService.validatePassword).not.toHaveBeenCalled();
        });
    });

    describe('startOperation guard', () => {
        it('should log an error and no-op when required context is missing', async () => {
            await (view as any).startOperation();

            expect(mockLogger.error).toHaveBeenCalledWith('Missing context for operation');
            expect(mockAppInstallationService.installApplications).not.toHaveBeenCalled();
            expect(mockAppInstallationService.uninstallApplications).not.toHaveBeenCalled();
        });
    });
});
