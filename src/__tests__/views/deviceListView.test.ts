/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceListViewController } from '../../views/devices/list/deviceListViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { DeviceService, ConnectXGroupService } from '../../services';
import { Device } from '../../types/devices';
import { ConnectXGroup } from '../../types/connectxGroup';
import { Message } from '../../types/messages';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('DeviceListViewController', () => {
    let controller: DeviceListViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockConnectxGroupService: jest.Mocked<ConnectXGroupService>;
    let mockUnsubscribe: jest.Mock;
    let mockGroupUnsubscribe: jest.Mock;

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

    const mockDevice3: Device = {
        id: 'device-3',
        name: 'Third Device',
        host: '192.168.1.102',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: {
            keyGenerated: true,
            keyCopied: true,
            connectionTested: true
        },
        createdAt: '2025-01-03T00:00:00Z',
    };

    const mockDevice4: Device = {
        id: 'device-4',
        name: 'Fourth Device',
        host: '192.168.1.103',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: {
            keyGenerated: true,
            keyCopied: true,
            connectionTested: true
        },
        createdAt: '2025-01-04T00:00:00Z',
    };

    const mockGroup: ConnectXGroup = {
        id: 'group-1',
        deviceIds: ['device-1', 'device-2'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
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

        // Create mock unsubscribe functions
        mockUnsubscribe = jest.fn();
        mockGroupUnsubscribe = jest.fn();

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

        // Create mock connectx group service
        mockConnectxGroupService = {
            getAllGroups: jest.fn().mockResolvedValue([]),
            getGroupForDevice: jest.fn().mockResolvedValue(undefined),
            removeGroupAndUnconfigureNICs: jest.fn().mockResolvedValue({ success: true }),
            subscribe: jest.fn().mockReturnValue(mockGroupUnsubscribe),
        } as any;

        controller = new DeviceListViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService,
            connectxGroupService: mockConnectxGroupService,
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

        it('should subscribe to group store updates', () => {
            expect(mockConnectxGroupService.subscribe).toHaveBeenCalled();
        });

        it('should call refresh when group store updates', async () => {
            const subscribeCallback = mockConnectxGroupService.subscribe.mock.calls[0][0];
            const refreshSpy = jest.spyOn(controller as any, 'refresh').mockResolvedValue(undefined);

            await subscribeCallback([]);

            expect(mockLogger.trace).toHaveBeenCalledWith('Group store updated, refreshing device list view');
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should handle refresh errors in group subscription callback', async () => {
            const subscribeCallback = mockConnectxGroupService.subscribe.mock.calls[0][0];
            const refreshError = new Error('Group refresh failed');
            jest.spyOn(controller as any, 'refresh').mockRejectedValue(refreshError);

            await subscribeCallback([]);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to refresh device list view after group store update',
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
                        pairedGroupCount: 0,
                        unpairedDeviceCount: 2
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
                        pairedGroupCount: 0,
                        unpairedDeviceCount: 0
                    }
                })
            );
        });

        it('should store render params for refresh', async () => {
            const params = { someParam: 'value' };
            await controller.render(params);

            expect((controller as any).lastRenderParams).toEqual(params);
        });

        it('should fetch groups from connectxGroupService', async () => {
            await controller.render();

            expect(mockConnectxGroupService.getAllGroups).toHaveBeenCalled();
        });

        it('should separate paired devices from unpaired devices', async () => {
            mockConnectxGroupService.getAllGroups.mockResolvedValue([mockGroup]);

            const html = await controller.render();

            // Both devices should still be rendered
            expect(html).toContain('Test Device');
            expect(html).toContain('Second Device');
            // Paired group container should be present
            expect(html).toContain('sidebar-paired-group-container');
            expect(html).toContain('data-group-id="group-1"');
            // Telemetry should reflect the grouping
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 2,
                        pairedGroupCount: 1,
                        unpairedDeviceCount: 0
                    }
                })
            );
        });

        it('should render mixed paired and unpaired devices', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice, mockDevice2, mockDevice3]);
            const groupWithFirstTwo: ConnectXGroup = {
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            mockConnectxGroupService.getAllGroups.mockResolvedValue([groupWithFirstTwo]);

            const html = await controller.render();

            expect(html).toContain('Test Device');
            expect(html).toContain('Second Device');
            expect(html).toContain('Third Device');
            expect(html).toContain('sidebar-paired-group-container');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 3,
                        pairedGroupCount: 1,
                        unpairedDeviceCount: 1
                    }
                })
            );
        });

        it('should render multiple paired groups', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice, mockDevice2, mockDevice3, mockDevice4]);
            const group1: ConnectXGroup = {
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            const group2: ConnectXGroup = {
                id: 'group-2',
                deviceIds: ['device-3', 'device-4'],
                createdAt: '2025-01-02T00:00:00Z',
                updatedAt: '2025-01-02T00:00:00Z'
            };
            mockConnectxGroupService.getAllGroups.mockResolvedValue([group1, group2]);

            const html = await controller.render();

            expect(html).toContain('data-group-id="group-1"');
            expect(html).toContain('data-group-id="group-2"');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 4,
                        pairedGroupCount: 2,
                        unpairedDeviceCount: 0
                    }
                })
            );
        });

        it('should render flat device list when no groups exist', async () => {
            mockConnectxGroupService.getAllGroups.mockResolvedValue([]);

            const html = await controller.render();

            expect(html).not.toContain('data-group-id="');
            expect(html).not.toContain('Paired Devices');
            expect(html).not.toContain('Unpaired Devices');
            expect(html).toContain('Test Device');
            expect(html).toContain('Second Device');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 2,
                        pairedGroupCount: 0,
                        unpairedDeviceCount: 2
                    }
                })
            );
        });

        it('should render paired group action buttons', async () => {
            mockConnectxGroupService.getAllGroups.mockResolvedValue([mockGroup]);

            const html = await controller.render();

            expect(html).toContain('data-action="pairing-details"');
            expect(html).toContain('data-action="unpair-devices"');
            expect(html).toContain('Pairing Details');
            expect(html).toContain('Unpair Devices');
        });

        it('should render section headers with correct counts', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice, mockDevice2, mockDevice3]);
            const group: ConnectXGroup = {
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            mockConnectxGroupService.getAllGroups.mockResolvedValue([group]);

            const html = await controller.render();

            expect(html).toContain('Paired Devices (2)');
            expect(html).toContain('Unpaired Devices (1)');
        });

        it('should handle group referencing non-existent device ids', async () => {
            const groupWithBadId: ConnectXGroup = {
                id: 'group-bad',
                deviceIds: ['device-1', 'non-existent-device'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            mockConnectxGroupService.getAllGroups.mockResolvedValue([groupWithBadId]);

            const html = await controller.render();

            // device-1 is paired, device-2 is unpaired, non-existent is ignored
            expect(html).toContain('sidebar-paired-group-container');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        deviceCount: 2,
                        pairedGroupCount: 1,
                        unpairedDeviceCount: 1
                    }
                })
            );
        });

        it('should render section toggle buttons when paired groups exist', async () => {
            mockConnectxGroupService.getAllGroups.mockResolvedValue([mockGroup]);

            const html = await controller.render();

            expect(html).toContain('data-section="paired"');
            expect(html).toContain('data-section="unpaired"');
            expect(html).toContain('Show less');
        });

        it('should not render section headers when no paired groups exist', async () => {
            mockConnectxGroupService.getAllGroups.mockResolvedValue([]);

            const html = await controller.render();

            expect(html).not.toContain('data-section="paired"');
            expect(html).not.toContain('data-section="unpaired"');
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

            it('should navigate to device manager when deleting a paired device', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
                mockConnectxGroupService.getGroupForDevice.mockResolvedValue(mockGroup);

                await controller.handleMessage({
                    type: 'delete-device',
                    id: 'device-1'
                } as Message);

                expect(mockConnectxGroupService.getGroupForDevice).toHaveBeenCalledWith('device-1');
                expect(navigateToSpy).toHaveBeenCalledWith('devices/manager', {
                    showDeleteWarningForDeviceId: 'device-1',
                    deleteWarningDeviceName: 'Test Device',
                    deleteWarningGroupId: 'group-1'
                }, 'editor');
                // Should NOT show the standard confirmation dialog
                expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
                // Should NOT delete the device yet
                expect(mockDeviceService.deleteDevice).not.toHaveBeenCalled();
            });

            it('should use standard confirmation for unpaired device', async () => {
                (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Delete');
                mockConnectxGroupService.getGroupForDevice.mockResolvedValue(undefined);

                await controller.handleMessage({
                    type: 'delete-device',
                    id: 'device-1'
                } as Message);

                expect(mockConnectxGroupService.getGroupForDevice).toHaveBeenCalledWith('device-1');
                expect(vscode.window.showWarningMessage).toHaveBeenCalled();
                expect(mockDeviceService.deleteDevice).toHaveBeenCalledWith('device-1');
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

        describe('register-dns', () => {
            it('should navigate to DNS registration', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({
                    type: 'register-dns',
                    id: 'device-1'
                } as Message);

                expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
                expect(navigateToSpy).toHaveBeenCalledWith(
                    'setup/dnsRegistration',
                    { device: mockDevice, setupType: 'migration' },
                    'editor'
                );
            });

            it('should throw error when device not found for DNS registration', async () => {
                mockDeviceService.getDevice.mockResolvedValue(undefined);

                await expect(controller.handleMessage({
                    type: 'register-dns',
                    id: 'device-1'
                } as Message)).rejects.toThrow('device not found: device-1');

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'device not found for mDNS registration',
                    { id: 'device-1' }
                );
            });
        });

        describe('pairing-details', () => {
            it('should navigate to pair details view with groupId', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({
                    type: 'pairing-details',
                    groupId: 'group-1'
                } as Message);

                expect(navigateToSpy).toHaveBeenCalledWith(
                    'groups/pairDetails',
                    { groupId: 'group-1' },
                    'editor'
                );
            });
        });

        describe('unpair-devices', () => {
            it('should navigate to unpair devices view with groupId', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({
                    type: 'unpair-devices',
                    groupId: 'group-1'
                } as Message);

                expect(navigateToSpy).toHaveBeenCalledWith(
                    'groups/unpairDevices',
                    { groupId: 'group-1' },
                    'editor'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    'Navigating to unpair devices view',
                    { groupId: 'group-1' }
                );
            });

            it('should navigate with a different groupId', async () => {
                const navigateToSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

                await controller.handleMessage({
                    type: 'unpair-devices',
                    groupId: 'group-xyz-456'
                } as Message);

                expect(navigateToSpy).toHaveBeenCalledWith(
                    'groups/unpairDevices',
                    { groupId: 'group-xyz-456' },
                    'editor'
                );
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
        it('should unsubscribe from device service and group service', () => {
            controller.dispose();

            expect(mockUnsubscribe).toHaveBeenCalled();
            expect(mockGroupUnsubscribe).toHaveBeenCalled();
        });

        it('should handle dispose when no subscription exists', () => {
            // Create controller without subscription
            mockDeviceService.subscribe.mockReturnValue(undefined as any);
            mockConnectxGroupService.subscribe.mockReturnValue(undefined as any);
            const controller2 = new DeviceListViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockConnectxGroupService,
            });

            expect(() => controller2.dispose()).not.toThrow();
        });
    });
});
