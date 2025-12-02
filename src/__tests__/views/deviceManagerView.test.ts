/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceManagerViewController } from '../../views/devices/manager/deviceManagerViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { IDeviceStore } from '../../types/store';
import { DeviceDiscoveryService, DeviceService } from '../../services';
import { Device } from '../../types/devices';

describe('DeviceManagerView', () => {
    let view: DeviceManagerViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockStore: jest.Mocked<IDeviceStore>;
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

        // Create mock store
        mockStore = {
            get: jest.fn(),
            getAll: jest.fn().mockReturnValue([]),
            set: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            subscribe: jest.fn().mockReturnValue(() => {}),
            clear: jest.fn(),
        } as any;

        // Create mock service
        mockService = {
            createDevice: jest.fn(),
            updateDevice: jest.fn(),
            deleteDevice: jest.fn(),
            connectToDevice: jest.fn(),
            getDevice: jest.fn(),
        } as any;

        // Create mock service
        mockDiscoveryService = {
            discoverDevices: jest.fn().mockResolvedValue([]),
        } as any;

        view = new DeviceManagerViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceStore: mockStore,
            deviceService: mockService,
            deviceDiscoveryService: mockDiscoveryService
        });
    });

    afterEach(() => {
        view.dispose();
    });

    describe('render', () => {
        it('should render empty state when no devices exist', async () => {
            mockStore.getAll.mockReturnValue([]);

            const html = await view.render();

            expect(html).toContain('No devices configured yet');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering device manager view',
                undefined
            );
        });

        it('should render device list when devices exist', async () => {
            mockStore.getAll.mockReturnValue([mockDevice]);

            const html = await view.render();

            expect(html).toContain('Test device');
            expect(html).toContain('192.168.1.100');
            expect(html).toContain('root');
            expect(html).not.toContain('No devices configured yet');
        });

        it('should show add form when showAddForm is true', async () => {
            mockStore.getAll.mockReturnValue([mockDevice]);

            const html = await view.render({ showAddForm: true });

            expect(html).toContain('Add New Device');
            // The form should not have the 'hidden' class
            expect(html).toContain('class="add-device-form "');
            // The show form button should have the 'hidden' class
            expect(html).toContain('show-form-btn hidden');
        });

        it('should show edit form when editDeviceId is provided', async () => {
            mockStore.getAll.mockReturnValue([mockDevice]);
            mockStore.get.mockReturnValue(mockDevice);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('Edit Device');
            expect(html).toContain('Test device');
            expect(html).toContain('192.168.1.100');
        });

        it('should auto-show form when no devices exist', async () => {
            mockStore.getAll.mockReturnValue([]);

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
                port: 22
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
    });

    describe('lifecycle', () => {
        it('should subscribe to store changes on construction', () => {
            expect(mockStore.subscribe).toHaveBeenCalled();
        });

        it('should unsubscribe from store on dispose', () => {
            const unsubscribe = jest.fn();
            mockStore.subscribe.mockReturnValue(unsubscribe);

            const newView = new DeviceManagerViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceStore: mockStore,
                deviceService: mockService,
                deviceDiscoveryService: mockDiscoveryService,
            });

            newView.dispose();

            expect(unsubscribe).toHaveBeenCalled();
        });
    });
});
