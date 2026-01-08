/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceListViewController } from '../../views/devices/list/deviceListViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { DeviceService } from '../../services';
import { Device } from '../../types/devices';
import { Message } from '../../types/messages';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('DeviceListViewController', () => {
    let controller: DeviceListViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockUnsubscribe: jest.Mock;

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
        createdAt: '2025-01-01T00:00:00Z',
    };

    const mockDevice2: Device = {
        id: 'device-2',
        name: 'Second Device',
        host: '192.168.1.101',
        username: 'zgx',
        port: 22,
        isSetup: false,
        useKeyAuth: false,
        keySetup: {
            keyGenerated: false,
            keyCopied: false,
            connectionTested: false
        },
        createdAt: '2025-01-02T00:00:00Z',
    };

    beforeEach(() => {
        // Create mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as any;

        // Create mock telemetry
        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Create mock unsubscribe function
        mockUnsubscribe = jest.fn();

        // Create mock device service
        mockDeviceService = {
            createDevice: jest.fn(),
            updateDevice: jest.fn().mockResolvedValue(undefined),
            deleteDevice: jest.fn().mockResolvedValue(undefined),
            connectToDevice: jest.fn().mockResolvedValue(undefined),
            getDevice: jest.fn().mockResolvedValue(mockDevice),
            getAllDevices: jest.fn().mockResolvedValue([mockDevice, mockDevice2]),
            subscribe: jest.fn().mockReturnValue(mockUnsubscribe),
        } as any;

        controller = new DeviceListViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService,
        });
    });

    afterEach(() => {
        controller.dispose();
        jest.clearAllMocks();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(DeviceListViewController.viewId()).toBe('devices/list');
        });
    });

    describe('constructor', () => {
        it('should subscribe to device service updates', () => {
            expect(mockDeviceService.subscribe).toHaveBeenCalled();
        });

        it('should call refresh when device store updates', async () => {
            // Get the callback passed to subscribe
            const subscribeCallback = mockDeviceService.subscribe.mock.calls[0][0];
            
            // Mock refresh method
            const refreshSpy = jest.spyOn(controller as any, 'refresh').mockResolvedValue(undefined);
            
            // Trigger the callback
            await subscribeCallback();
            
            expect(mockLogger.trace).toHaveBeenCalledWith('Device store updated, refreshing device list view');
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should handle refresh errors in subscription callback', async () => {
            // Get the callback passed to subscribe
            const subscribeCallback = mockDeviceService.subscribe.mock.calls[0][0];
            
            // Mock refresh to throw error
            const refreshError = new Error('Refresh failed');
            jest.spyOn(controller as any, 'refresh').mockRejectedValue(refreshError);
            
            // Trigger the callback
            await subscribeCallback();
            
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to refresh device list view after store update',
                { error: refreshError }
            );
        });
    });

    describe('render', () => {
        it('should render with devices', async () => {
            const html = await controller.render();

            expect(mockDeviceService.getAllDevices).toHaveBeenCalled();
            expect(html).toContain('Test Device');
            expect(html).toContain('Second Device');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: TelemetryEventType.View,
                    action: 'navigate',
                    properties: {
                        toView: 'devices.list',
                    },
                    measurements: {
                        deviceCount: 2,
                    }
                })
            );
        });

        it('should render with no devices', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([]);

            const html = await controller.render();

            expect(html).toBeDefined();
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 0,
                    }
                })
            );
        });

        it('should store render params for refresh', async () => {
            const params = { someParam: 'value' };
            await controller.render(params);

            expect((controller as any).lastRenderParams).toEqual(params);
        });
    });

    describe('handleMessage', () => {
        describe('refresh', () => {
            it('should handle refresh message', async () => {
                const refreshSpy = jest.spyOn(controller as any, 'refresh').mockResolvedValue(undefined);

                await controller.handleMessage({ type: 'refresh' } as Message);

                expect(refreshSpy).toHaveBeenCalled();
            });
        });

        describe('select-device', () => {
            it('should handle select-device message', async () => {
                await controller.handleMessage({ 
                    type: 'select-device',
                    id: 'device-1'
                } as Message);

                expect(mockLogger.debug).toHaveBeenCalledWith('device selected', { id: 'device-1' });
            });
        });

        describe('quick-links', () => {
            it('should handle docs link', async () => {
                const mockOpenExternal = jest.fn().mockResolvedValue(true);
                (vscode.env as any).openExternal = mockOpenExternal;
                (vscode.Uri as any).parse = jest.fn().mockReturnValue('parsed-uri');

                await controller.handleMessage({ 
                    type: 'quick-links',
                    link: 'docs'
                } as Message);

                expect(mockOpenExternal).toHaveBeenCalledWith('parsed-uri');
                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        properties: {
                            toView: 'external.docs',
                        }
                    })
                );
            });

            it('should handle templates link', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({ 
                    type: 'quick-links',
                    link: 'templates'
                } as Message);

                expect(navigateToSpy).toHaveBeenCalledWith('templates/list', {}, 'editor');
            });
        });

        describe('connect-device', () => {
            it('should connect to device successfully', async () => {
                await controller.handleMessage({ 
                    type: 'connect-device',
                    id: 'device-1',
                    newWindow: false
                } as Message);

                expect(mockDeviceService.connectToDevice).toHaveBeenCalledWith('device-1', false);
                expect(mockLogger.info).toHaveBeenCalledWith('Connecting to device', { 
                    id: 'device-1', 
                    newWindow: false 
                });
            });

            it('should connect to device in new window', async () => {
                await controller.handleMessage({ 
                    type: 'connect-device',
                    id: 'device-1',
                    newWindow: true
                } as Message);

                expect(mockDeviceService.connectToDevice).toHaveBeenCalledWith('device-1', true);
            });

            it('should handle DeviceNeedsSetupError and navigate to setup', async () => {
                // Mock DeviceNeedsSetupError
                const { DeviceNeedsSetupError } = await import('../../services/deviceService');
                const setupError = new DeviceNeedsSetupError('Device needs setup', mockDevice);
                
                mockDeviceService.connectToDevice.mockRejectedValue(setupError);
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({ 
                    type: 'connect-device',
                    id: 'device-1',
                    newWindow: false
                } as Message);

                expect(navigateToSpy).toHaveBeenCalledWith('setup/options', { device: mockDevice }, 'editor');
                expect(mockLogger.info).toHaveBeenCalledWith(
                    'device needs setup, navigating to setup flow',
                    expect.objectContaining({
                        id: 'device-1',
                        deviceName: 'Test Device'
                    })
                );
            });

            it('should throw other connection errors', async () => {
                const error = new Error('Connection failed');
                mockDeviceService.connectToDevice.mockRejectedValue(error);

                await expect(controller.handleMessage({ 
                    type: 'connect-device',
                    id: 'device-1',
                    newWindow: false
                } as Message)).rejects.toThrow('Connection failed');

                expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to device', { 
                    error,
                    id: 'device-1' 
                });
            });
        });

        describe('setup-device', () => {
            it('should setup device successfully', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({ 
                    type: 'setup-device',
                    id: 'device-1'
                } as Message);

                expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
                expect(navigateToSpy).toHaveBeenCalledWith('setup/options', { device: mockDevice }, 'editor');
            });

            it('should throw error when device not found', async () => {
                mockDeviceService.getDevice.mockResolvedValue(undefined);

                await expect(controller.handleMessage({ 
                    type: 'setup-device',
                    id: 'device-1'
                } as Message)).rejects.toThrow('device not found: device-1');

                expect(mockLogger.error).toHaveBeenCalledWith('device not found for setup', { id: 'device-1' });
            });

            it('should handle setup errors', async () => {
                const error = new Error('Setup failed');
                mockDeviceService.getDevice.mockRejectedValue(error);

                await expect(controller.handleMessage({ 
                    type: 'setup-device',
                    id: 'device-1'
                } as Message)).rejects.toThrow('Setup failed');

                expect(mockLogger.error).toHaveBeenCalledWith('Failed to start device setup', { 
                    error,
                    id: 'device-1' 
                });
            });
        });

        describe('delete-device', () => {
            it('should delete device after confirmation', async () => {
                (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Delete');

                await controller.handleMessage({ 
                    type: 'delete-device',
                    id: 'device-1'
                } as Message);

                expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
                expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                    'Are you sure you want to delete Test Device?',
                    { modal: true },
                    'Delete'
                );
                expect(mockDeviceService.deleteDevice).toHaveBeenCalledWith('device-1');
                expect(mockLogger.debug).toHaveBeenCalledWith('device deleted', { 
                    id: 'device-1',
                    deviceName: 'Test Device' 
                });
            });

            it('should cancel deletion when user cancels', async () => {
                (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue(undefined);

                await controller.handleMessage({ 
                    type: 'delete-device',
                    id: 'device-1'
                } as Message);

                expect(mockDeviceService.deleteDevice).not.toHaveBeenCalled();
                expect(mockLogger.debug).toHaveBeenCalledWith('device deletion cancelled by user', { 
                    id: 'device-1',
                    deviceName: 'Test Device' 
                });
            });

            it('should throw error when device not found for deletion', async () => {
                mockDeviceService.getDevice.mockResolvedValue(undefined);

                await expect(controller.handleMessage({ 
                    type: 'delete-device',
                    id: 'device-1'
                } as Message)).rejects.toThrow('device not found: device-1');

                expect(mockLogger.error).toHaveBeenCalledWith('device not found for deletion', { id: 'device-1' });
            });

            it('should handle deletion errors', async () => {
                (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Delete');
                const error = new Error('Deletion failed');
                mockDeviceService.deleteDevice.mockRejectedValue(error);

                await expect(controller.handleMessage({ 
                    type: 'delete-device',
                    id: 'device-1'
                } as Message)).rejects.toThrow('Deletion failed');

                expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete device', { 
                    error,
                    id: 'device-1' 
                });
            });
        });

        describe('manage-apps', () => {
            it('should navigate to app management', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({ 
                    type: 'manage-apps',
                    id: 'device-1'
                } as Message);

                expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
                expect(navigateToSpy).toHaveBeenCalledWith('apps/selection', { device: mockDevice }, 'editor');
            });

            it('should throw error when device not found for app management', async () => {
                mockDeviceService.getDevice.mockResolvedValue(undefined);

                await expect(controller.handleMessage({ 
                    type: 'manage-apps',
                    id: 'device-1'
                } as Message)).rejects.toThrow('device not found: device-1');

                expect(mockLogger.error).toHaveBeenCalledWith('device not found for app management', { id: 'device-1' });
            });
        });

        describe('unknown message types', () => {
            it('should handle unknown message types gracefully', async () => {
                await controller.handleMessage({ 
                    type: 'unknown-type'
                } as any);

                // Should not throw, just pass through to base class
                expect(mockLogger.trace).toHaveBeenCalled();
            });
        });
    });

    describe('dispose', () => {
        it('should unsubscribe from device service', () => {
            controller.dispose();

            expect(mockUnsubscribe).toHaveBeenCalled();
        });

        it('should handle dispose when no subscription exists', () => {
            // Create controller without subscription
            mockDeviceService.subscribe.mockReturnValue(undefined as any);
            const controller2 = new DeviceListViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
            });

            expect(() => controller2.dispose()).not.toThrow();
        });
    });
});
