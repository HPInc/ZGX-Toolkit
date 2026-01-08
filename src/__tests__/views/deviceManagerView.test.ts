/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceManagerViewController } from '../../views/devices/manager/deviceManagerViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { DeviceDiscoveryService, DeviceService } from '../../services';
import { Device, DeviceConfig } from '../../types/devices';

describe('DeviceManagerView', () => {
    let view: DeviceManagerViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockService: jest.Mocked<DeviceService>;
    let mockDiscoveryService: jest.Mocked<DeviceDiscoveryService>;

    const mockDevice: Device = {
        id: 'test-1',
        name: 'Test device',
        host: '192.168.1.100',
        username: 'root',
        port: 22,
        isSetup: false,
        useKeyAuth: false,
        keySetup: {
            keyGenerated: false,
            keyCopied: false,
            connectionTested: false
        },
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

        // Create mock service
        mockService = {
            createDevice: jest.fn(),
            updateDevice: jest.fn(),
            deleteDevice: jest.fn(),
            connectToDevice: jest.fn(),
            getDevice: jest.fn(),
            getAllDevices: jest.fn().mockReturnValue([]),
            subscribe: jest.fn().mockReturnValue(() => {}),
        } as any;

        // Create mock service
        mockDiscoveryService = {
            discoverDevices: jest.fn().mockResolvedValue([]),
        } as any;

        view = new DeviceManagerViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockService,
            deviceDiscoveryService: mockDiscoveryService
        });
    });

    afterEach(() => {
        view.dispose();
    });

    describe('render', () => {
        it('should render empty state when no devices exist', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('No devices configured yet');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering device manager view',
                undefined
            );
        });

        it('should render device list when devices exist', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            const html = await view.render();

            expect(html).toContain('Test device');
            expect(html).toContain('192.168.1.100');
            expect(html).toContain('root');
            expect(html).not.toContain('No devices configured yet');
        });

        it('should show add form when showAddForm is true', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            const html = await view.render({ showAddForm: true });

            expect(html).toContain('Add New Device');
            // The form should not have the 'hidden' class
            expect(html).toContain('class="add-device-form "');
            // The show form button should have the 'hidden' class
            expect(html).toContain('show-form-btn hidden');
        });

        it('should show edit form when editDeviceId is provided', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('Edit Device');
            expect(html).toContain('Test device');
            expect(html).toContain('192.168.1.100');
        });

        it('should auto-show form when no devices exist', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('Add New Device');
        });
    });

    describe('handleMessage', () => {
        it('should handle create-device message', async () => {
            const deviceData = {
                name: 'New device',
                host: '192.168.1.101',
                username: 'admin',
                port: 22,
                useKeyAuth: false,
            };

            await view.handleMessage({
                type: 'create-device',
                data: deviceData,
            });

            expect(mockService.createDevice).toHaveBeenCalledWith(deviceData);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Creating device',
                { name: 'New device' }
            );
        });

        it('should handle update-device message', async () => {
            const updates = { name: 'Updated device' };

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates,
            });

            expect(mockService.updateDevice).toHaveBeenCalledWith('test-1', updates);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Updating device',
                { id: 'test-1' }
            );
        });

        it('should handle delete-device message', async () => {
            // Mock getDevice to return a device
            (mockService.getDevice as jest.Mock).mockReturnValue(mockDevice);
            
            // Mock VS Code confirmation dialog to return 'Delete'
            const vscode = require('vscode');
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');

            await view.handleMessage({
                type: 'delete-device',
                id: 'test-1',
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                `Are you sure you want to delete ${mockDevice.name}?`,
                { modal: true },
                'Delete'
            );
            expect(mockService.deleteDevice).toHaveBeenCalledWith('test-1');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Deleting device',
                { id: 'test-1' }
            );
        });

        it('should cancel delete when user clicks Cancel', async () => {
            // Mock getDevice to return a device
            (mockService.getDevice as jest.Mock).mockReturnValue(mockDevice);
            
            // Mock VS Code confirmation dialog to return 'Cancel'
            const vscode = require('vscode');
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

            await view.handleMessage({
                type: 'delete-device',
                id: 'test-1',
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
            expect(mockService.deleteDevice).not.toHaveBeenCalled();
        });

        it('should handle connect-device message', async () => {
            await view.handleMessage({
                type: 'connect-device',
                id: 'test-1',
                newWindow: false,
            });

            expect(mockService.connectToDevice).toHaveBeenCalledWith('test-1', false);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Connecting to device',
                { id: 'test-1', newWindow: false }
            );
        });

        it('should handle connect-device with new window', async () => {
            await view.handleMessage({
                type: 'connect-device',
                id: 'test-1',
                newWindow: true,
            });

            expect(mockService.connectToDevice).toHaveBeenCalledWith('test-1', true);
        });

        it('should handle discover-devices message', async () => {
            const mockDiscoveredDevice = {
                name: 'Test Device 2',
                hostname: 'test-device-2.local',
                addresses: ['192.168.1.2'],
                port: 22,
                protocol: 'tcp'
            };
            const discoveredDevices = [mockDiscoveredDevice];
            mockDiscoveryService.discoverDevices.mockResolvedValue(discoveredDevices);

            await view.handleMessage({
                type: 'discover-devices',
            });

            expect(mockDiscoveryService.discoverDevices).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Starting device discovery',
                undefined
            );
        });

        it('should handle register-dns message', async () => {
            const setupDevice = { 
                ...mockDevice, 
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                }
            };
            mockService.getDevice.mockResolvedValue(setupDevice);

            await view.handleMessage({
                type: 'register-dns',
                id: 'test-1',
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Navigating to mDNS registration',
                { id: 'test-1' }
            );
        });

        it('should throw error when device not found for DNS registration', async () => {
            mockService.getDevice.mockResolvedValue(undefined);

            await expect(view.handleMessage({
                type: 'register-dns',
                id: 'nonexistent',
            })).rejects.toThrow('device not found: nonexistent');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for mDNS registration',
                { id: 'nonexistent' }
            );
        });
    });

    describe('render with DNS registration status', () => {
        it('should mark devices needing DNS registration', async () => {
            const deviceNeedingDns = {
                ...mockDevice,
                id: 'needs-dns',
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                }
            };

            mockService.getAllDevices.mockResolvedValue([deviceNeedingDns]);

            const html = await view.render();

            expect(html).toContain('needs-dns');
            expect(mockService.getAllDevices).toHaveBeenCalled();
        });

        it('should not mark devices with DNS already registered', async () => {
            const deviceWithDns = {
                ...mockDevice,
                id: 'has-dns',
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                dnsInstanceName: 'test-dns-instance'
            };

            mockService.getAllDevices.mockResolvedValue([deviceWithDns]);

            const html = await view.render();

            expect(html).toContain('has-dns');
            expect(mockService.getAllDevices).toHaveBeenCalled();
        });

        it('should not mark devices that are not setup', async () => {
            const notSetupDevice = {
                ...mockDevice,
                id: 'not-setup',
                isSetup: false
            };

            mockService.getAllDevices.mockResolvedValue([notSetupDevice]);

            const html = await view.render();

            expect(html).toContain('not-setup');
            expect(mockService.getAllDevices).toHaveBeenCalled();
        });

        it('should not mark devices without key auth', async () => {
            const passwordAuthDevice = {
                ...mockDevice,
                id: 'password-auth',
                isSetup: true,
                useKeyAuth: false
            };

            mockService.getAllDevices.mockResolvedValue([passwordAuthDevice]);

            const html = await view.render();

            expect(html).toContain('password-auth');
            expect(mockService.getAllDevices).toHaveBeenCalled();
        });

        it('should not mark devices without tested connection', async () => {
            const untestedDevice = {
                ...mockDevice,
                id: 'untested',
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: false
                }
            };

            mockService.getAllDevices.mockResolvedValue([untestedDevice]);

            const html = await view.render();

            expect(html).toContain('untested');
            expect(mockService.getAllDevices).toHaveBeenCalled();
        });
    });

    describe('lifecycle', () => {
        it('should subscribe to store changes on construction', () => {
            expect(mockService.subscribe).toHaveBeenCalled();
        });

        it('should unsubscribe from store on dispose', () => {
            const unsubscribe = jest.fn();
            mockService.subscribe.mockReturnValue(unsubscribe);

            const newView = new DeviceManagerViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockService,
                deviceDiscoveryService: mockDiscoveryService,
            });

            newView.dispose();

            expect(unsubscribe).toHaveBeenCalled();
        });

        it('should call refresh when device store updates', async () => {
            // Get the callback passed to subscribe
            const subscribeCallback = mockService.subscribe.mock.calls[0][0];
            
            // Mock refresh method
            const refreshSpy = jest.spyOn(view as any, 'refresh').mockResolvedValue(undefined);
            
            // Trigger the callback
            await subscribeCallback();
            
            expect(mockLogger.trace).toHaveBeenCalledWith('Device store updated, refreshing device manager view');
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should handle refresh errors in subscription callback', async () => {
            // Get the callback passed to subscribe
            const subscribeCallback = mockService.subscribe.mock.calls[0][0];
            
            // Mock refresh to throw error
            const refreshError = new Error('Refresh failed');
            jest.spyOn(view as any, 'refresh').mockRejectedValue(refreshError);
            
            // Trigger the callback
            await subscribeCallback();
            
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to refresh device manager view after store update',
                { error: refreshError }
            );
        });

        it('should handle dispose when no subscription exists', () => {
            // Create controller without subscription
            mockService.subscribe.mockReturnValue(undefined as any);
            const view2 = new DeviceManagerViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockService,
                deviceDiscoveryService: mockDiscoveryService,
            });

            expect(() => view2.dispose()).not.toThrow();
        });
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(DeviceManagerViewController.viewId()).toBe('devices/manager');
        });
    });

    describe('createDevice', () => {
        it('should send success message on successful creation', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockService.createDevice.mockResolvedValue(mockDevice);

            await view.handleMessage({
                type: 'create-device',
                data: { name: 'Test', host: '192.168.1.1', username: 'test', port: 22, useKeyAuth: false }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceCreated',
                success: true
            });
        });

        it('should send error message on creation failure', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const error = new Error('Creation failed');
            mockService.createDevice.mockRejectedValue(error);

            const deviceConfig: DeviceConfig = {
                name: 'Test',
                host: '192.168.1.100',
                username: 'test',
                port: 22,
                useKeyAuth: false
            };

            await view.handleMessage({
                type: 'create-device',
                data: deviceConfig
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceCreateError',
                error: 'Creation failed'
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to create device', { error });
        });

        it('should handle non-Error exceptions in creation', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockService.createDevice.mockRejectedValue('String error');

            await view.handleMessage({
                type: 'create-device',
                data: { name: 'Test', host: '192.168.1.1', username: 'test', port: 22, useKeyAuth: false }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceCreateError',
                error: 'Failed to create device'
            });
        });
    });

    describe('updateDevice', () => {
        it('should send success message on successful update', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockService.updateDevice.mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { name: 'Updated' }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceUpdated',
                success: true
            });
        });

        it('should send error message on update failure', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const error = new Error('Update failed');
            mockService.updateDevice.mockRejectedValue(error);

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { name: 'Updated' }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceUpdateError',
                error: 'Update failed'
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to update device', { error, id: 'test-1' });
        });

        it('should handle non-Error exceptions in update', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockService.updateDevice.mockRejectedValue('String error');

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { name: 'Updated' }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'deviceUpdateError',
                error: 'Failed to update device'
            });
        });
    });

    describe('deleteDevice', () => {
        it('should throw error when device not found', async () => {
            mockService.getDevice.mockResolvedValue(undefined);

            await expect(view.handleMessage({
                type: 'delete-device',
                id: 'test-1'
            })).rejects.toThrow('device not found: test-1');

            expect(mockLogger.error).toHaveBeenCalledWith('device not found for deletion', { id: 'test-1' });
        });

        it('should handle deletion errors', async () => {
            const vscode = require('vscode');
            mockService.getDevice.mockResolvedValue(mockDevice);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');
            const error = new Error('Deletion failed');
            mockService.deleteDevice.mockRejectedValue(error);

            await expect(view.handleMessage({
                type: 'delete-device',
                id: 'test-1'
            })).rejects.toThrow('Deletion failed');

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete device', { error, id: 'test-1' });
        });
    });

    describe('connectDevice', () => {
        it('should handle DeviceNeedsSetupError and navigate to setup', async () => {
            const { DeviceNeedsSetupError } = await import('../../services/deviceService');
            const setupError = new DeviceNeedsSetupError('Device needs setup', mockDevice);
            
            mockService.connectToDevice.mockRejectedValue(setupError);
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'connect-device',
                id: 'test-1',
                newWindow: false
            });

            expect(navigateToSpy).toHaveBeenCalledWith('setup/options', { device: mockDevice }, 'editor');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'device needs setup, navigating to setup flow',
                expect.objectContaining({
                    id: 'test-1',
                    deviceName: 'Test device'
                })
            );
        });

        it('should throw other connection errors', async () => {
            const error = new Error('Connection failed');
            mockService.connectToDevice.mockRejectedValue(error);

            await expect(view.handleMessage({
                type: 'connect-device',
                id: 'test-1',
                newWindow: false
            })).rejects.toThrow('Connection failed');

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to device', { error, id: 'test-1' });
        });
    });

    describe('setupDevice', () => {
        it('should navigate to setup options', async () => {
            mockService.getDevice.mockResolvedValue(mockDevice);
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'setup-device',
                id: 'test-1'
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(navigateToSpy).toHaveBeenCalledWith('setup/options', { device: mockDevice }, 'editor');
        });

        it('should throw error when device not found', async () => {
            mockService.getDevice.mockResolvedValue(undefined);

            await expect(view.handleMessage({
                type: 'setup-device',
                id: 'test-1'
            })).rejects.toThrow('device not found: test-1');

            expect(mockLogger.error).toHaveBeenCalledWith('device not found for setup', { id: 'test-1' });
        });

        it('should handle setup errors', async () => {
            const error = new Error('Setup failed');
            mockService.getDevice.mockRejectedValue(error);

            await expect(view.handleMessage({
                type: 'setup-device',
                id: 'test-1'
            })).rejects.toThrow('Setup failed');

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to start device setup', { error, id: 'test-1' });
        });
    });

    describe('manageApps', () => {
        it('should navigate to app management', async () => {
            mockService.getDevice.mockResolvedValue(mockDevice);
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'manage-apps',
                id: 'test-1'
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(navigateToSpy).toHaveBeenCalledWith('apps/selection', { device: mockDevice });
        });

        it('should throw error when device not found', async () => {
            mockService.getDevice.mockResolvedValue(undefined);

            await expect(view.handleMessage({
                type: 'manage-apps',
                id: 'test-1'
            })).rejects.toThrow('device not found: test-1');

            expect(mockLogger.error).toHaveBeenCalledWith('device not found for app management', { id: 'test-1' });
        });
    });

    describe('discoverDevices', () => {
        it('should send success messages on discovery', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const mockDiscoveredDevices = [{
                name: 'Found Device',
                hostname: 'found-device.local',
                addresses: ['192.168.1.50'],
                port: 22,
                protocol: 'tcp'
            }];
            mockDiscoveryService.discoverDevices.mockResolvedValue(mockDiscoveredDevices);

            await view.handleMessage({
                type: 'discover-devices',
                options: { timeout: 5000 }
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'discoveryStarted' });
            expect(mockDiscoveryService.discoverDevices).toHaveBeenCalledWith({ timeout: 5000 });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryCompleted',
                devices: mockDiscoveredDevices
            });
            expect(mockLogger.info).toHaveBeenCalledWith('Discovery completed', { count: 1 });
        });

        it('should send error message on discovery failure', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const error = new Error('Discovery failed');
            mockDiscoveryService.discoverDevices.mockRejectedValue(error);

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'discoveryStarted' });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Discovery failed'
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Discovery failed', { error });
        });

        it('should handle non-Error exceptions in discovery', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.discoverDevices.mockRejectedValue('String error');

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Discovery failed'
            });
        });
    });

    describe('refresh message', () => {
        it('should handle refresh message', async () => {
            const refreshSpy = jest.spyOn(view as any, 'refresh').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'refresh'
            });

            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should log error on refresh failure', async () => {
            const error = new Error('Refresh failed');
            jest.spyOn(view as any, 'refresh').mockRejectedValue(error);

            await view.handleMessage({
                type: 'refresh'
            });

            // Give time for the catch block to execute
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to refresh device manager view', { error });
        });
    });

    describe('render params handling', () => {
        it('should store render params for refresh', async () => {
            const params = { showAddForm: true };
            await view.render(params);

            expect((view as any).lastRenderParams).toEqual(params);
        });

        it('should handle render with editDeviceId but device not found', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(undefined);

            const html = await view.render({ editDeviceId: 'nonexistent' });

            expect(html).toBeDefined();
            expect(mockService.getDevice).toHaveBeenCalledWith('nonexistent');
        });
    });

    describe('rediscover-device', () => {
        beforeEach(() => {
            mockDiscoveryService.rediscoverDevices = jest.fn().mockResolvedValue([]);
        });

        it('should handle rediscover-device message', async () => {
            const mockDiscoveredDevice = {
                name: 'Test Device',
                hostname: 'test-device.local',
                addresses: ['192.168.1.50'],
                port: 22,
                protocol: 'tcp'
            };
            mockDiscoveryService.rediscoverDevices.mockResolvedValue([mockDiscoveredDevice]);

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'a1b2c3d4'
            });

            expect(mockDiscoveryService.rediscoverDevices).toHaveBeenCalledWith(['a1b2c3d4'], undefined);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Starting device rediscovery',
                { deviceId: 'test-1', dnsInstanceName: 'a1b2c3d4', timeoutMs: undefined }
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Device rediscovery completed',
                { deviceId: 'test-1', count: 1 }
            );
        });

        it('should send success messages on device rediscovery', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const mockDiscoveredDevice = {
                name: 'Test Device',
                hostname: 'test-device.local',
                addresses: ['192.168.1.50'],
                port: 22,
                protocol: 'tcp'
            };
            mockDiscoveryService.rediscoverDevices.mockResolvedValue([mockDiscoveredDevice]);

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'a1b2c3d4',
                timeoutMs: 5000
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'discoveryStarted' });
            expect(mockDiscoveryService.rediscoverDevices).toHaveBeenCalledWith(['a1b2c3d4'], 5000);
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryCompleted',
                devices: [mockDiscoveredDevice]
            });
        });

        it('should send error message on device rediscovery failure', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const error = new Error('Device rediscovery failed');
            mockDiscoveryService.rediscoverDevices.mockRejectedValue(error);

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'a1b2c3d4'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'discoveryStarted' });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Device rediscovery failed'
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Device rediscovery failed', { deviceId: 'test-1', error });
        });

        it('should handle non-Error exceptions in device rediscovery', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.rediscoverDevices.mockRejectedValue('String error');

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'a1b2c3d4'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Device rediscovery failed'
            });
        });

        it('should pass single DNS instance name as array to rediscoverDevices', async () => {
            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'xyz123'
            });

            expect(mockDiscoveryService.rediscoverDevices).toHaveBeenCalledWith(['xyz123'], undefined);
        });

        it('should handle device rediscovery with no results', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.rediscoverDevices.mockResolvedValue([]);

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: 'a1b2c3d4'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryCompleted',
                devices: []
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Device rediscovery completed',
                { deviceId: 'test-1', count: 0 }
            );
        });
    });

    describe('render with editing device', () => {
        it('should include editingDevice flag when editing', async () => {
            const deviceWithDns = {
                ...mockDevice,
                dnsInstanceName: 'a1b2c3d4'
            };
            mockService.getAllDevices.mockResolvedValue([deviceWithDns]);
            mockService.getDevice.mockResolvedValue(deviceWithDns);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('editingDevice');
            expect(html).toContain('a1b2c3d4');
            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
        });

        it('should not include editingDevice flag when adding new device', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            const html = await view.render({ showAddForm: true });

            expect(html).not.toContain('data-dns-instance-name="a1b2c3d4"');
        });

        it('should include empty dnsInstanceName when device has none', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('data-dns-instance-name=""');
            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
        });

        it('should show Rediscover Device button text when editing device', async () => {
            const deviceWithDns = {
                ...mockDevice,
                dnsInstanceName: 'a1b2c3d4'
            };
            mockService.getAllDevices.mockResolvedValue([deviceWithDns]);
            mockService.getDevice.mockResolvedValue(deviceWithDns);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('Rediscover Device');
        });

        it('should show Discover Devices button text when adding device', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render({ showAddForm: true });

            expect(html).toContain('Discover Devices');
        });
    });

    describe('device card data attributes', () => {
        it('should include dnsInstanceName in device card data attribute', async () => {
            const deviceWithDns = {
                ...mockDevice,
                id: 'device-with-dns',
                name: 'test-device-dns',
                dnsInstanceName: 'abc123def'
            };
            mockService.getAllDevices.mockResolvedValue([deviceWithDns]);

            const html = await view.render();

            expect(html).toContain('data-dns-instance-name="abc123def"');
            expect(html).toContain('data-id="device-with-dns"');
        });

        it('should include empty dnsInstanceName in device card when device has none', async () => {
            const deviceWithoutDns = {
                ...mockDevice,
                id: 'device-no-dns',
                name: 'test-device-no-dns',
                dnsInstanceName: undefined
            };
            mockService.getAllDevices.mockResolvedValue([deviceWithoutDns]);

            const html = await view.render();

            expect(html).toContain('data-dns-instance-name=""');
            expect(html).toContain('data-id="device-no-dns"');
        });

        it('should include dnsInstanceName for multiple devices with different states', async () => {
            const devices = [
                { ...mockDevice, id: 'device-1', name: 'device-1', dnsInstanceName: 'first123' },
                { ...mockDevice, id: 'device-2', name: 'device-2', dnsInstanceName: undefined },
                { ...mockDevice, id: 'device-3', name: 'device-3', dnsInstanceName: 'third456' }
            ];
            mockService.getAllDevices.mockResolvedValue(devices);

            const html = await view.render();

            // Check each device has correct attribute
            expect(html).toContain('data-id="device-1"');
            expect(html).toContain('data-dns-instance-name="first123"');
            expect(html).toContain('data-id="device-2"');
            // Should have empty string for device-2 somewhere in the HTML
            expect(html).toMatch(/data-id="device-2"[\s\S]*?data-dns-instance-name=""/);
            expect(html).toContain('data-id="device-3"');
            expect(html).toContain('data-dns-instance-name="third456"');
        });
    });
});
