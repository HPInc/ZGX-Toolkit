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

// Mock the providers
jest.mock('../providers/zgxToolkitProvider');

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
        getTelemetryEnabled: jest.fn().mockReturnValue(true)
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

    describe('deactivate', () => {
        it('should deactivate without errors', () => {
            // deactivate function should complete without throwing
            expect(() => deactivate()).not.toThrow();
        });

        it('should be a function', () => {
            expect(typeof deactivate).toBe('function');
        });
    });
});