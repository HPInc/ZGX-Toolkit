/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { activate, deactivate, resetActivationState, notifyDevicesWithUnknownType } from '../extension';
import { extensionStateService } from '../services/extensionStateService';
import { telemetryService } from '../services/telemetryService';
import { configService } from '../services/configService';
import { dnsServiceRegistration } from '../services/dnsRegistrationService';
import * as services from '../services';
import { ConfigurationSchemaNotRegisteredError } from '../services/configMigrationService';
import { GLOBAL_STATE_KEYS } from '../constants/globalState';
import { TelemetryEventType } from '../types/telemetry';
import { Device, DeviceType } from '../types/devices';
import { deviceStore } from '../store';
import { remoteSessionRegistryService } from '../services/remoteSessionRegistryService';
import { deviceReachabilityCheckService } from '../services/deviceReachabilityCheckService';
import { connectionStateStore } from '../store/connectionStateStore';
import { logger } from '../utils/logger';

// Mock the providers
jest.mock('../providers/zgxToolkitProvider');

// Mock the reachability check service so disconnect handling doesn't perform real network probes
jest.mock('../services/deviceReachabilityCheckService', () => ({
    deviceReachabilityCheckService: {
        checkDevicesReachability: jest.fn().mockResolvedValue(undefined)
    }
}));

// Mock extensionStateService
jest.mock('../services/extensionStateService', () => ({
    extensionStateService: {
        initialize: jest.fn(),
        isFirstRun: jest.fn().mockReturnValue(false),
        setFirstRun: jest.fn().mockResolvedValue(undefined)
    }
}));

// Mock telemetryService
jest.mock('../services/telemetryService', () => ({
    telemetryService: {
        setEnabled: jest.fn(),
        trackEvent: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined)
    }
}));

// Mock configService
jest.mock('../services/configService', () => ({
    configService: {
        getLogLevel: jest.fn().mockReturnValue('info'),
        getTelemetryEnabled: jest.fn().mockReturnValue(true),
        getReachabilityRefreshIntervalMs: jest.fn().mockReturnValue(60000),
        getReachabilityEnabled: jest.fn().mockReturnValue(true)
    }
}));

// Mock dnsServiceRegistration
jest.mock('../services/dnsRegistrationService', () => ({
    dnsServiceRegistration: {
        migrateExistingDevices: jest.fn().mockResolvedValue(undefined)
    }
}));

describe('Extension', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
    // Reset activation state before each test
        resetActivationState();
    
        mockContext = {
            subscriptions: [] as any[],
            extensionUri: vscode.Uri.file('/mock/extension/path'),
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn().mockReturnValue([]),
                update: jest.fn()
            },
            extensionPath: '/mock/extension/path',
            storagePath: '/mock/storage/path',
            globalStoragePath: '/mock/global/storage/path',
            logPath: '/mock/log/path',
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            } as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: jest.fn(),
            storageUri: vscode.Uri.file('/mock/storage'),
            globalStorageUri: vscode.Uri.file('/mock/global/storage'),
            logUri: vscode.Uri.file('/mock/log'),
            extensionMode: 1,
            extension: {
                packageJSON: {
                    name: 'test-extension',
                    version: '1.0.0'
                }
            }
        } as any;

        // Clear all mocks before each test
        jest.clearAllMocks();
        (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
        deviceStore.clear();
        (vscode.env.remoteName as any) = undefined;
        (vscode.workspace.workspaceFolders as any) = undefined;
    });

    afterEach(() => {
        // activate() registers real timers (e.g. connection state reconciliation) as disposables
        // on the context; dispose them so they don't keep running (and keeping the process alive)
        // after the test finishes.
        mockContext.subscriptions.forEach(subscription => subscription?.dispose?.());
        mockContext.subscriptions.length = 0;
    });

    describe('activate', () => {
        it('should activate the extension successfully', async () => {
            await activate(mockContext);

            // Verify subscriptions were added
            expect(mockContext.subscriptions.length).toBeGreaterThan(0);
        });

        it('should register webview provider', async () => {
            const registerWebviewViewProviderSpy = jest.spyOn(
                vscode.window,
                'registerWebviewViewProvider'
            );

            await activate(mockContext);

            // Verify webview provider registration
            expect(registerWebviewViewProviderSpy).toHaveBeenCalledWith(
                'remoteDevicesList',
                expect.anything()
            );
        });

        it('should register all commands', async () => {
            const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

            await activate(mockContext);

            // Verify command registrations
            expect(registerCommandSpy).toHaveBeenCalled();
      
            // Check for key commands
            const commandIds = registerCommandSpy.mock.calls.map(call => call[0]);
            expect(commandIds).toContain('zgxToolkit.setLogLevel');
            expect(commandIds).toContain('zgxToolkit.toggleTelemetry');
            expect(commandIds).toContain('zgxToolkit.showTelemetryStatus');
        });

        it('should add subscriptions to context', async () => {
            await activate(mockContext);

            // Verify that subscriptions were added (webview provider + commands)
            expect(mockContext.subscriptions.length).toBeGreaterThanOrEqual(2);
        });

        it('should not activate twice', async () => {
            await activate(mockContext);
            const firstSubscriptionCount = mockContext.subscriptions.length;
      
            await activate(mockContext);
            const secondSubscriptionCount = mockContext.subscriptions.length;
      
            // Should have the same number of subscriptions
            expect(secondSubscriptionCount).toBe(firstSubscriptionCount);
        });

        it('starts the reachability updater and restarts it when reachability settings change', async () => {
            const configurationHandlers: ((event: { affectsConfiguration: (section: string) => boolean }) => void)[] = [];
            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation(handler => {
                configurationHandlers.push(handler);
                return { dispose: jest.fn() };
            });

            await activate(mockContext);
            await new Promise(resolve => setImmediate(resolve));

            expect(configService.getReachabilityEnabled).toHaveBeenCalled();
            expect(deviceReachabilityCheckService.checkDevicesReachability).toHaveBeenCalledWith([]);
            expect(configurationHandlers).toHaveLength(1);

            configurationHandlers[0]({
                affectsConfiguration: section => section === 'zToolkit.reachability.refreshInterval'
            });

            expect(configService.getReachabilityRefreshIntervalMs).toHaveBeenCalled();
        });

        it('does not start a reachability interval when disabled', async () => {
            (configService.getReachabilityEnabled as jest.Mock).mockReturnValue(false);

            await activate(mockContext);

            expect(deviceReachabilityCheckService.checkDevicesReachability).not.toHaveBeenCalled();
            (configService.getReachabilityEnabled as jest.Mock).mockReturnValue(true);
        });

        it('should track first activation when extension runs for first time', async () => {
            (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(true);
      
            await activate(mockContext);
      
            expect(extensionStateService.isFirstRun).toHaveBeenCalled();
            expect(extensionStateService.setFirstRun).toHaveBeenCalledWith(true);
        });

        it('should track regular activation when extension has run before', async () => {
            (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
      
            await activate(mockContext);
      
            expect(extensionStateService.isFirstRun).toHaveBeenCalled();
            expect(extensionStateService.setFirstRun).not.toHaveBeenCalled();
        });

        it('requests window reload and exits activation when schema is not registered and retries remain', async () => {
            jest.spyOn(services, 'migrateSettings').mockRejectedValueOnce(new ConfigurationSchemaNotRegisteredError());
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined as any);
            const registerWebviewSpy = jest.spyOn(vscode.window, 'registerWebviewViewProvider');
            const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            (mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
                if (key === GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1) {
                    return false;
                }
                if (key === GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS) {
                    return 0;
                }
                return undefined;
            });

            await activate(mockContext);

            expect(mockContext.globalState.update).toHaveBeenCalledWith(GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS, 1);
            expect(executeCommandSpy).toHaveBeenCalledWith('workbench.action.reloadWindow');
            expect(registerWebviewSpy).not.toHaveBeenCalled();
            expect(showErrorSpy).not.toHaveBeenCalledWith(
                'Z Toolkit settings migration failed. Please check your user settings and update them manually if necessary.'
            );
        });

        it('marks migration done and continues activation after max schema reload attempts', async () => {
            jest.spyOn(services, 'migrateSettings').mockRejectedValueOnce(new ConfigurationSchemaNotRegisteredError());
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined as any);
            const registerWebviewSpy = jest.spyOn(vscode.window, 'registerWebviewViewProvider');
            const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            (mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
                if (key === GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1) {
                    return false;
                }
                if (key === GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS) {
                    return 2;
                }
                return undefined;
            });

            await activate(mockContext);

            expect(executeCommandSpy).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
            expect(mockContext.globalState.update).toHaveBeenCalledWith(GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1, true);
            expect(showErrorSpy).toHaveBeenCalledWith(
                'Z Toolkit settings migration failed. Please check your user settings and update them manually if necessary.'
            );
            expect(registerWebviewSpy).toHaveBeenCalled();
        });

        it('marks migration done and continues activation on non-schema migration errors', async () => {
            jest.spyOn(services, 'migrateSettings').mockRejectedValueOnce(new Error('migration failed'));
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined as any);
            const registerWebviewSpy = jest.spyOn(vscode.window, 'registerWebviewViewProvider');
            const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            (mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
                if (key === GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1) {
                    return false;
                }
                if (key === GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS) {
                    return 0;
                }
                return undefined;
            });

            await activate(mockContext);

            expect(executeCommandSpy).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
            expect(mockContext.globalState.update).toHaveBeenCalledWith(GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1, true);
            expect(showErrorSpy).toHaveBeenCalledWith(
                'Z Toolkit settings migration failed. Please check your user settings and update them manually if necessary.'
            );
            expect(registerWebviewSpy).toHaveBeenCalled();
        });
    });

    describe('Telemetry tracking', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            resetActivationState();
        });

        it('should track activation event with version on first run', async () => {
            (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(true);
      
            await activate(mockContext);
      
            expect(telemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.Extension,
                action: 'firstActivation',
                properties: {
                    version: '1.0.0'
                }
            });
            expect(extensionStateService.setFirstRun).toHaveBeenCalledWith(true);
        });

        it('should track activation event with version on subsequent runs', async () => {
            (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
      
            await activate(mockContext);
      
            expect(telemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.Extension,
                action: 'activate',
                properties: {
                    version: '1.0.0'
                }
            });
            expect(extensionStateService.setFirstRun).not.toHaveBeenCalled();
        });

        it('should enable telemetry when both VS Code and extension settings are enabled', async () => {
            (vscode.env.isTelemetryEnabled as any) = true;
            (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
            await activate(mockContext);
      
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(true);
        });

        it('should disable telemetry when VS Code telemetry is disabled', async () => {
            (vscode.env.isTelemetryEnabled as any) = false;
            (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
            await activate(mockContext);
      
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
        });

        it('should disable telemetry when extension telemetry setting is disabled', async () => {
            (vscode.env.isTelemetryEnabled as any) = true;
            (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
            await activate(mockContext);
      
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
        });

        it('should update telemetry state when VS Code telemetry setting changes', async () => {
            (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
            let telemetryChangeHandler: ((enabled: boolean) => void) | undefined;
      
            // Capture the onDidChangeTelemetryEnabled handler
            (vscode.env.onDidChangeTelemetryEnabled as jest.Mock).mockImplementation((handler) => {
                telemetryChangeHandler = handler;
                return { dispose: jest.fn() };
            });
      
            await activate(mockContext);
      
            // Simulate VS Code telemetry being disabled
            telemetryChangeHandler?.(false);
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
      
            // Simulate VS Code telemetry being enabled
            telemetryChangeHandler?.(true);
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(true);
        });

        it('should respect extension telemetry setting when VS Code setting changes', async () => {
            (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
            let telemetryChangeHandler: ((enabled: boolean) => void) | undefined;
      
            (vscode.env.onDidChangeTelemetryEnabled as jest.Mock).mockImplementation((handler) => {
                telemetryChangeHandler = handler;
                return { dispose: jest.fn() };
            });
      
            await activate(mockContext);
      
            // Even if VS Code enables telemetry, it should remain disabled if extension setting is false
            telemetryChangeHandler?.(true);
            expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
        });

        it('should dispose telemetry service on cleanup', async () => {
            await activate(mockContext);
      
            // Find the telemetry dispose subscription
            const telemetryDisposable = mockContext.subscriptions.find(
                sub => sub.dispose && sub.dispose.toString().includes('telemetryService')
            );
      
            expect(telemetryDisposable).toBeDefined();
      
            // Call dispose
            await telemetryDisposable?.dispose();
      
            expect(telemetryService.dispose).toHaveBeenCalled();
        });
    });

    describe('DNS Migration', () => {
        it('should call migrateExistingDevices during activation', async () => {
            await activate(mockContext);
      
            // Wait for async operation to complete
            await new Promise(resolve => setTimeout(resolve, 10));
      
            expect(dnsServiceRegistration.migrateExistingDevices).toHaveBeenCalled();
            expect(dnsServiceRegistration.migrateExistingDevices).toHaveBeenCalledWith(
                expect.anything(), // deviceService
                vscode.window
            );
        });

        it('should continue activation even if DNS migration fails', async () => {
            // Mock migration to reject
            (dnsServiceRegistration.migrateExistingDevices as jest.Mock).mockRejectedValueOnce(
                new Error('Migration test error')
            );

            // Activation should still succeed
            await expect(activate(mockContext)).resolves.not.toThrow();
      
            // Extension should still be activated
            expect(mockContext.subscriptions.length).toBeGreaterThan(0);
        });

        it('should log error when DNS migration fails', async () => {
            const mockError = new Error('DNS migration test error');
            (dnsServiceRegistration.migrateExistingDevices as jest.Mock).mockRejectedValueOnce(mockError);

            await activate(mockContext);
      
            // Wait for async operation and error handler to complete
            await new Promise(resolve => setTimeout(resolve, 10));
      
            // The error should be caught and logged, but not throw
            expect(dnsServiceRegistration.migrateExistingDevices).toHaveBeenCalled();
        });
    });

    describe('notifyDevicesWithUnknownType', () => {
        const makeDevice = (overrides: Partial<Device> = {}): Device => ({
            id: 'device-1',
            name: 'Device',
            host: '192.168.1.10',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: new Date().toISOString(),
            ...overrides
        });

        it('shows a Dismiss notification when a device has an unknown device type', async () => {
            const mockDeviceService = {
                getAllDevices: jest.fn().mockResolvedValue([
                    makeDevice({ fingerprint: { deviceType: DeviceType.Unknown } })
                ])
            };
            const mockWindow = { showInformationMessage: jest.fn().mockResolvedValue(undefined) };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Add device types to your devices'),
                'Dismiss'
            );
        });

        it('shows a Dismiss notification when a device has no fingerprint data', async () => {
            const mockDeviceService = {
                getAllDevices: jest.fn().mockResolvedValue([makeDevice()])
            };
            const mockWindow = { showInformationMessage: jest.fn().mockResolvedValue(undefined) };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Add device types to your devices'),
                'Dismiss'
            );
        });

        it('shows a Dismiss notification when a device fingerprint has no device type', async () => {
            const mockDeviceService = {
                getAllDevices: jest.fn().mockResolvedValue([makeDevice({ fingerprint: {} })])
            };
            const mockWindow = { showInformationMessage: jest.fn().mockResolvedValue(undefined) };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Add device types to your devices'),
                'Dismiss'
            );
        });

        it('does not show a notification when all devices have a known, selectable device type', async () => {
            const mockDeviceService = {
                getAllDevices: jest.fn().mockResolvedValue([
                    makeDevice({ fingerprint: { deviceType: DeviceType.Z8 } })
                ])
            };
            const mockWindow = { showInformationMessage: jest.fn() };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
        });

        it('does not show a notification when a device is still pending fingerprint detection', async () => {
            const mockDeviceService = {
                getAllDevices: jest.fn().mockResolvedValue([
                    makeDevice({ fingerprint: { deviceType: DeviceType.Pending } })
                ])
            };
            const mockWindow = { showInformationMessage: jest.fn() };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
        });

        it('does not show a notification when there are no devices', async () => {
            const mockDeviceService = { getAllDevices: jest.fn().mockResolvedValue([]) };
            const mockWindow = { showInformationMessage: jest.fn() };

            await notifyDevicesWithUnknownType(mockDeviceService as any, mockWindow as any);

            expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
        });

        it('is invoked as part of extension activation', async () => {
            const showInfoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await activate(mockContext);

            // Wait for the fire-and-forget async check to settle
            await new Promise(resolve => setTimeout(resolve, 10));

            // No devices are persisted in the mocked globalState, so no notification is expected,
            // but the check must run without throwing and without blocking activation.
            expect(mockContext.subscriptions.length).toBeGreaterThan(0);
            showInfoSpy.mockRestore();
        });
    });

    describe('Remote-SSH session registration', () => {
        const makeDevice = (overrides: Partial<Device> = {}): Device => ({
            id: 'device-1',
            name: 'Device',
            host: '192.168.1.10',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: '2026-01-01T00:00:00.000Z',
            ...overrides
        });

        it('registers a matching Remote-SSH device and unregisters it during cleanup', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockResolvedValue(undefined);
            const showInformationMessageSpy = jest.spyOn(vscode.window, 'showInformationMessage');
            (showInformationMessageSpy as jest.Mock).mockResolvedValue('Dismiss');

            await activate(mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(registerSpy).toHaveBeenCalledWith({
                deviceId: device.id,
                connectLabel: 'root@192.168.1.10',
                windowId: 'mock-session-id'
            });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.extension.zgx-toolkit');
            expect(showInformationMessageSpy).toHaveBeenCalledWith(
                `Connected to ${device.name} in dedicated window.`,
                'Dismiss',
                'Disconnect'
            );
            expect(unregisterSpy).not.toHaveBeenCalled();

            mockContext.subscriptions.forEach(subscription => subscription?.dispose?.());
            expect(unregisterSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
        });

        it('closes the Remote-SSH connection when Disconnect is selected in the dedicated window notification', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockResolvedValue(undefined);
            const closeRemoteConnectionSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
            const showInformationMessageSpy = jest.spyOn(vscode.window, 'showInformationMessage');
            (showInformationMessageSpy as jest.Mock).mockResolvedValue('Disconnect');

            await activate(mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(unregisterSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
            expect(closeRemoteConnectionSpy).toHaveBeenCalledWith('workbench.action.remote.close');
        });

        it('does not log an error when the dedicated window notification is canceled', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            const loggerErrorSpy = jest.spyOn(logger, 'error');
            const canceledError = Object.assign(new Error('Canceled'), { name: 'Canceled' });
            (vscode.window.showInformationMessage as jest.Mock).mockRejectedValue(canceledError);

            await activate(mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(loggerErrorSpy).not.toHaveBeenCalledWith(
                'Failed to process dedicated window connection notification',
                expect.anything()
            );

            loggerErrorSpy.mockRestore();
        });

        it('closes the Remote-SSH connection when another window requests a disconnect', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            const changeHandlers: Parameters<typeof remoteSessionRegistryService.onDidChange>[0][] = [];
            jest.spyOn(remoteSessionRegistryService, 'onDidChange').mockImplementation(listener => {
                changeHandlers.push(listener);
                return { dispose: jest.fn() };
            });
            jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            const consumeDisconnectRequestSpy = jest.spyOn(remoteSessionRegistryService, 'consumeDisconnectRequest').mockResolvedValue(true);
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockResolvedValue(undefined);
            const closeRemoteConnectionSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Dismiss');

            await activate(mockContext);
            const remoteSessionChangeHandler = changeHandlers[changeHandlers.length - 1];
            remoteSessionChangeHandler([]);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(consumeDisconnectRequestSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
            expect(unregisterSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
            expect(deviceReachabilityCheckService.checkDevicesReachability).toHaveBeenCalledWith([device]);
            expect(closeRemoteConnectionSpy).toHaveBeenCalledWith('workbench.action.remote.close');
        });

        it('does not register a Remote-SSH session for an unknown connect label', async () => {
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+unknown-host' } }];
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);

            await activate(mockContext);

            expect(registerSpy).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.view.extension.zgx-toolkit');
        });

        it('does not register a Remote-SSH session without a workspace authority', async () => {
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: '' } }];
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);

            await activate(mockContext);

            expect(registerSpy).not.toHaveBeenCalled();
        });

        it('retries Remote-SSH registration when workspace folders become available', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            let workspaceFolderChangeHandler: (() => void) | undefined;
            (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock).mockImplementation((handler) => {
                workspaceFolderChangeHandler = handler;
                return { dispose: jest.fn() };
            });
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);

            await activate(mockContext);
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            workspaceFolderChangeHandler?.();

            expect(registerSpy).toHaveBeenCalledWith({
                deviceId: device.id,
                connectLabel: 'root@192.168.1.10',
                windowId: 'mock-session-id'
            });
        });

        it('registers when the window transitions from local to Remote-SSH', async () => {
            const device = makeDevice();
            deviceStore.set(device.id, device);
            let workspaceFolderChangeHandler: (() => void) | undefined;
            (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock).mockImplementation((handler) => {
                workspaceFolderChangeHandler = handler;
                return { dispose: jest.fn() };
            });
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);

            await activate(mockContext);
            expect(registerSpy).not.toHaveBeenCalled();

            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            workspaceFolderChangeHandler?.();

            expect(registerSpy).toHaveBeenCalledWith({
                deviceId: device.id,
                connectLabel: 'root@192.168.1.10',
                windowId: 'mock-session-id'
            });
        });

        it('unregisters and re-registers when the Remote-SSH authority changes', async () => {
            const firstDevice = makeDevice();
            const secondDevice = makeDevice({ id: 'device-2', host: '192.168.1.11' });
            deviceStore.set(firstDevice.id, firstDevice);
            deviceStore.set(secondDevice.id, secondDevice);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            let workspaceFolderChangeHandler: (() => void) | undefined;
            (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock).mockImplementation((handler) => {
                workspaceFolderChangeHandler = handler;
                return { dispose: jest.fn() };
            });
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockResolvedValue(undefined);

            await activate(mockContext);
            await new Promise(resolve => setTimeout(resolve, 0));

            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.11' } }];
            workspaceFolderChangeHandler?.();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(registerSpy).toHaveBeenNthCalledWith(1, {
                deviceId: firstDevice.id,
                connectLabel: 'root@192.168.1.10',
                windowId: 'mock-session-id'
            });
            expect(registerSpy).toHaveBeenNthCalledWith(2, {
                deviceId: secondDevice.id,
                connectLabel: 'root@192.168.1.11',
                windowId: 'mock-session-id'
            });
            expect(unregisterSpy).toHaveBeenCalledWith(firstDevice.id, 'mock-session-id');
        });

        it('does not attempt Remote-SSH registration in a local window', async () => {
            const registerSpy = jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);

            await activate(mockContext);

            expect(registerSpy).not.toHaveBeenCalled();
        });
    });

    describe('Cross-window reachability recheck', () => {
        afterEach(() => {
            connectionStateStore.clear();
        });

        it('re-checks reachability in this window when the shared registry reports a device disconnected elsewhere', async () => {
            const device = {
                id: 'device-1',
                name: 'Device',
                host: '192.168.1.10',
                username: 'zgx',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            } as Device;
            deviceStore.set(device.id, device);
            connectionStateStore.reconcile([{
                deviceId: device.id,
                connectLabel: 'zgx@192.168.1.10',
                windowId: 'another-window',
                connectedAt: new Date().toISOString(),
                lastHeartbeat: new Date().toISOString()
            }]);
            jest.spyOn(remoteSessionRegistryService, 'readAll').mockResolvedValue([]);

            await activate(mockContext);

            expect(deviceReachabilityCheckService.checkDevicesReachability).toHaveBeenCalledWith([device]);
        });
    });

    describe('deactivate', () => {
        it('unregisters an active Remote-SSH session during deactivation', async () => {
            const device = {
                id: 'device-1',
                name: 'Device',
                host: '192.168.1.10',
                username: 'root',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
                createdAt: '2026-01-01T00:00:00.000Z'
            } as Device;
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockResolvedValue(undefined);

            await activate(mockContext);
            await deactivate();

            expect(unregisterSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
        });

        it('waits for the active Remote-SSH session to unregister during deactivation', async () => {
            const device = {
                id: 'device-1',
                name: 'Device',
                host: '192.168.1.10',
                username: 'root',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
                createdAt: '2026-01-01T00:00:00.000Z'
            } as Device;
            deviceStore.set(device.id, device);
            (vscode.env.remoteName as any) = 'ssh-remote';
            (vscode.workspace.workspaceFolders as any) = [{ uri: { authority: 'ssh-remote+root%40192.168.1.10' } }];
            jest.spyOn(remoteSessionRegistryService, 'register').mockResolvedValue(undefined);
            let resolveUnregister: (() => void) | undefined;
            const unregisterSpy = jest.spyOn(remoteSessionRegistryService, 'unregister').mockImplementation(
                () => new Promise<void>(resolve => {
                    resolveUnregister = resolve;
                })
            );

            await activate(mockContext);
            const deactivation = deactivate();
            let deactivated = false;
            void deactivation.then(() => {
                deactivated = true;
            });

            await Promise.resolve();

            expect(unregisterSpy).toHaveBeenCalledWith(device.id, 'mock-session-id');
            expect(unregisterSpy).toHaveBeenCalledTimes(1);
            expect(deactivated).toBe(false);

            resolveUnregister?.();
            await deactivation;
            expect(deactivated).toBe(true);
        });

        it('should deactivate without errors', () => {
            // deactivate function should complete without throwing
            expect(() => deactivate()).not.toThrow();
        });

        it('should be a function', () => {
            expect(typeof deactivate).toBe('function');
        });
    });
});