/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceManagerViewController } from '../../views/devices/manager/deviceManagerViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { DeviceDiscoveryService, DeviceService, ConnectXGroupService, DeviceFingerprintService, extensionStateService } from '../../services';
import { DeviceDiscoveryError } from '../../services/deviceDiscoveryService';
import { Device, DeviceConfig, DeviceType } from '../../types/devices';
import { URLS } from '../../constants/config';
import * as vscode from 'vscode';

describe('DeviceManagerView', () => {
    let view: DeviceManagerViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockService: jest.Mocked<DeviceService>;
    let mockDiscoveryService: jest.Mocked<DeviceDiscoveryService>;
    let mockGroupService: jest.Mocked<ConnectXGroupService>;
    let mockFingerprintService: jest.Mocked<DeviceFingerprintService>;

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
            trace: jest.fn()
        } as any;

        // Create mock telemetry
        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        } as any;

        // Create mock service
        mockService = {
            createDevice: jest.fn(),
            updateDevice: jest.fn(),
            deleteDevice: jest.fn(),
            connectToDevice: jest.fn(),
            getDevice: jest.fn(),
            getAllDevices: jest.fn().mockReturnValue([]),
            subscribe: jest.fn().mockReturnValue(() => {})
        } as any;

        // Create mock service
        mockDiscoveryService = {
            discoverDevices: jest.fn().mockResolvedValue([])
        } as any;

        // Create mock group service
        mockGroupService = {
            getAllGroups: jest.fn().mockResolvedValue([]),
            getGroupForDevice: jest.fn().mockResolvedValue(undefined),
            removeGroupAndUnconfigureNICs: jest.fn().mockResolvedValue({ success: true }),
            subscribe: jest.fn().mockReturnValue(() => {})
        } as any;

        // Create mock fingerprint service
        mockFingerprintService = {
            updateDeviceFingerprint: jest.fn((existing, updates) => ({ ...existing, ...updates })),
            buildDeviceFingerprint: jest.fn()
        } as any;

        view = new DeviceManagerViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockService,
            deviceDiscoveryService: mockDiscoveryService,
            connectxGroupService: mockGroupService,
            deviceFingerprintService: mockFingerprintService
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

        it('should show a dash for device type when no fingerprint is set', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            const html = await view.render();

            expect(html).toContain('<strong>Device type:</strong> —');
        });

        it('should show a dash for device type when it is unknown', async () => {
            mockService.getAllDevices.mockResolvedValue([
                { ...mockDevice, fingerprint: { deviceType: DeviceType.Unknown } }
            ]);

            const html = await view.render();

            expect(html).toContain('<strong>Device type:</strong> —');
        });

        it('should show a dash for device type when it is pending', async () => {
            mockService.getAllDevices.mockResolvedValue([
                { ...mockDevice, fingerprint: { deviceType: DeviceType.Pending } }
            ]);

            const html = await view.render();

            expect(html).toContain('<strong>Device type:</strong> —');
        });

        it('should show the human-readable label when device type is known', async () => {
            mockService.getAllDevices.mockResolvedValue([
                { ...mockDevice, fingerprint: { deviceType: DeviceType.Z8 } }
            ]);

            const html = await view.render();

            expect(html).toContain('<strong>Device type:</strong> Z8');
        });

        it('should show add form when showAddForm is true', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            const html = await view.render({ showAddForm: true });

            expect(html).toContain('Add New Device');
            // The form should not have the 'hidden' class
            expect(html).toContain('class="add-device-form "');
            // The show form button should have the 'hidden' class
            expect(html).toContain('show-form-btn hidden');
            // Device type select should be hidden when adding a new device
            expect(html).toContain('form-group hidden" id="deviceTypeGroup"');
        });

        it('should show edit form when editDeviceId is provided', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('Edit Device');
            expect(html).toContain('Test device');
            expect(html).toContain('192.168.1.100');
            // Device type select should be visible (not hidden) when editing
            expect(html).toContain('form-group " id="deviceTypeGroup"');
        });

        it('should render device type options reused from getDeviceTypeOptions', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('id="deviceType"');
            expect(html).toContain('ZGX Fury');
            expect(html).toContain('ZGX Nano');
            expect(html).toContain('>Z8<');
            expect(html).toContain('>Z6<');
            expect(html).toContain('>Z4<');
            expect(html).toContain('>Z2<');
            expect(html).toContain('>Other<');
            // Internal-only lifecycle states must not be user-selectable
            expect(html).not.toContain('value="pending"');
            expect(html).not.toContain('value="unknown"');
        });

        it('should pre-select the device\'s current device type when editing', async () => {
            const deviceWithType: Device = {
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.Z8 }
            };
            mockService.getAllDevices.mockResolvedValue([deviceWithType]);
            mockService.getDevice.mockResolvedValue(deviceWithType);

            const html = await view.render({ editDeviceId: 'test-1' });

            expect(html).toContain('value="z8" selected');
        });

        it('should auto-show form when no devices exist', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('Add New Device');
        });

        it('should render Discover Devices button with discover icon', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('id="discoverBtn"');
            expect(html).toContain('Discover Devices');
        });

        it('should render the "What\'s this?" info tooltip button', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('id="discoverInfoBtn"');
            expect(html).toContain("What's this?");
            expect(html).toContain('discover-tooltip');
            expect(html).toContain('Find devices on your network.');
            expect(html).toContain('Works automatically for supported devices (like ZGX Nano and ZGX Fury)');
            expect(html).toContain('<b>same subnet</b>');
            expect(html).toContain('advertise via mDNS will also appear automatically');
            expect(html).toContain('discovery becomes available <b>after</b> setup is complete');
        });

        it('should render discovery error card (initially hidden)', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('id="discoveryErrorCard"');
            expect(html).toContain('discovery-error-card hidden');
            expect(html).toContain('No devices found.');
            expect(html).toContain('Device discovery works automatically for supported devices on the same subnet.');
            expect(html).toContain('advertise over mDNS appear automatically');
            expect(html).toContain('input the target device address manually to continue');
            expect(html).toContain('id="discoveryErrorCode"');
            expect(html).toContain('id="discoveryErrorCodeValue"');
            expect(html).not.toContain('#ZTK-DISCO-NO-DEVICES');
            expect(html).not.toContain('Reference code:');
            expect(html).toContain('Having an issue?');
            expect(html).toContain('https://github.com/HPInc/ZGX-Toolkit/issues');
        });

        it('should render Add Device button with btn-blue class', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('btn btn-blue');
        });

        it('should render Cancel button with btn-ghost class', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('btn btn-ghost');
        });
    });

    describe('Pair Devices eligibility', () => {
        const createDevice = (id: string, deviceType: DeviceType, isSetup = true): Device => ({
            ...mockDevice,
            id,
            name: `Device ${id}`,
            isSetup,
            fingerprint: { deviceType }
        });

        const getPairDevicesButton = (html: string): string =>
            html.match(/<button[^>]*id="pairDevicesBtn"[^>]*>/)?.[0] ?? '';

        it('should always enable Pair Devices when there are no devices at all', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(getPairDevicesButton(html)).not.toContain('disabled');
        });

        it('should always enable Pair Devices regardless of device type/setup/pairing combinations', async () => {
            const scenarios: Device[][] = [
                // Only unsupported device types
                [
                    createDevice('device-1', DeviceType.Z8),
                    createDevice('device-2', DeviceType.Z8)
                ],
                // Different compatible types
                [
                    createDevice('device-1', DeviceType.ZGXNano),
                    createDevice('device-2', DeviceType.ZGXFury)
                ],
                // Compatible type but not setup
                [
                    createDevice('device-1', DeviceType.ZGXNano),
                    createDevice('device-2', DeviceType.ZGXNano, false)
                ],
                // Two unpaired ZGX Nano devices
                [
                    createDevice('device-1', DeviceType.ZGXNano),
                    createDevice('device-2', DeviceType.ZGXNano)
                ],
                // Two unpaired ZGX Fury devices
                [
                    createDevice('device-1', DeviceType.ZGXFury),
                    createDevice('device-2', DeviceType.ZGXFury)
                ]
            ];

            for (const devices of scenarios) {
                mockService.getAllDevices.mockResolvedValue(devices);
                mockGroupService.getAllGroups.mockResolvedValue([]);

                const html = await view.render();

                expect(getPairDevicesButton(html)).not.toContain('disabled');
            }
        });

        it('should always enable Pair Devices when the only compatible devices are already paired', async () => {
            mockService.getAllDevices.mockResolvedValue([
                createDevice('device-1', DeviceType.ZGXNano),
                createDevice('device-2', DeviceType.ZGXNano)
            ]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                }
            ]);

            const html = await view.render();

            expect(getPairDevicesButton(html)).not.toContain('disabled');
        });

        it('should render the Pair Devices information tooltip', async () => {
            mockService.getAllDevices.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('codicon-info');
            expect(html).toContain('id="pairDevicesTooltip"');
            expect(html).toContain('role="tooltip"');
            expect(html).toContain('aria-describedby="pairDevicesTooltip"');
            expect(html).toContain('Pair devices');
            expect(html).toContain('Connect <b>two</b> compatible devices to work together and scale local compute resources. Devices must be the <b>same type</b> and support NVIDIA® ConnectX™ Networking.');
        });
    });

    describe('paired device groups', () => {
        const mockDevice1: Device = {
            id: 'device-1',
            name: 'Device A',
            host: '192.168.1.100',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z'
        };

        const mockDevice2: Device = {
            id: 'device-2',
            name: 'Device B',
            host: '192.168.1.101',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z'
        };

        const mockDevice3: Device = {
            id: 'device-3',
            name: 'Device C',
            host: '192.168.1.102',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z'
        };

        it('should render paired devices in a group container', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2, mockDevice3]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                }
            ]);

            const html = await view.render();

            // Should have paired group container
            expect(html).toContain('paired-group-container');
            expect(html).toContain('paired-group-label');
            expect(html).toContain('paired-label-text');
            expect(html).toContain('codicon-link');
            
            // Should show both paired devices
            expect(html).toContain('Device A');
            expect(html).toContain('Device B');
            // Unpaired device should also be shown
            expect(html).toContain('Device C');
            // Device type field should render (dash, since no fingerprint set) for paired cards too
            expect(html).toContain('<strong>Device type:</strong> —');
        });

        it('should render paired devices before unpaired devices with section counts', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2, mockDevice3]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                }
            ]);

            const html = await view.render();

            expect(html).toContain('Paired Devices (2)');
            expect(html).toContain('Unpaired Devices (1)');
            expect(html.indexOf('Paired Devices (2)')).toBeLessThan(html.indexOf('Unpaired Devices (1)'));
            expect(html).toContain('data-group-id="group-1"');
            expect(html).toContain('data-action="pairing-details"');
            expect(html).toContain('data-action="unpair-devices"');
        });

        it('should render an empty paired section when all devices are unpaired', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('Paired Devices (0)');
            expect(html).toContain('No paired devices');
            expect(html).toContain('Unpaired Devices (2)');
            expect(html).not.toContain('data-group-id=');
        });

        it('should render an empty unpaired section when all devices are paired', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                }
            ]);

            const html = await view.render();

            expect(html).toContain('Paired Devices (2)');
            expect(html).toContain('Unpaired Devices (0)');
            expect(html).toContain('No unpaired devices');
            expect(html).toContain('data-group-id="group-1"');
        });

        it('should show paired badge on grouped devices', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                }
            ]);

            const html = await view.render();

            // Should show paired badge
            expect(html).toContain('paired-badge');
        });

        it('should render unpaired devices without group container', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            // Should not have paired group container
            expect(html).not.toContain('data-group-id=');
            // Should show both devices normally
            expect(html).toContain('Device A');
            expect(html).toContain('Device B');
        });

        it('should handle multiple paired groups', async () => {
            const mockDevice4: Device = {
                id: 'device-4',
                name: 'Device D',
                host: '192.168.1.103',
                username: 'root',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };

            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2, mockDevice3, mockDevice4]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                },
                {
                    id: 'group-2',
                    deviceIds: ['device-3', 'device-4'],
                    createdAt: '2025-01-02T00:00:00Z',
                    updatedAt: '2025-01-02T00:00:00Z'
                }
            ]);

            const html = await view.render();

            // Count paired-group-container divs — one per group
            const groupMatches = html.match(/class="paired-group-container"/g);
            expect(groupMatches?.length).toBe(2);
            
            // All devices should be shown
            expect(html).toContain('Device A');
            expect(html).toContain('Device B');
            expect(html).toContain('Device C');
            expect(html).toContain('Device D');
        });

        it('should subscribe to group store changes', () => {
            expect(mockGroupService.subscribe).toHaveBeenCalled();
        });
    });

    describe('handleMessage', () => {
        it('should handle create-device message', async () => {
            const deviceData = {
                name: 'New device',
                host: '192.168.1.101',
                username: 'admin',
                port: 22,
                useKeyAuth: false
            };

            await view.handleMessage({
                type: 'create-device',
                data: deviceData
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
                updates
            });

            expect(mockService.updateDevice).toHaveBeenCalledWith('test-1', updates);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Updating device',
                { id: 'test-1' }
            );
        });

        it('should merge a manually-selected device type into the existing fingerprint on update', async () => {
            mockService.getDevice.mockResolvedValue({
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.Unknown }
            });
            (mockFingerprintService.updateDeviceFingerprint as jest.Mock).mockReturnValue({
                deviceType: DeviceType.Z8
            });

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { name: 'Updated device', fingerprint: { deviceType: DeviceType.Z8 } }
            });

            expect(mockFingerprintService.updateDeviceFingerprint).toHaveBeenCalledWith(
                { deviceType: DeviceType.Unknown },
                { deviceType: DeviceType.Z8 }
            );
            expect(mockService.updateDevice).toHaveBeenCalledWith('test-1', {
                name: 'Updated device',
                fingerprint: { deviceType: DeviceType.Z8 }
            });
        });

        it('should reject an update-device message with a non-selectable device type', async () => {
            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { fingerprint: { deviceType: DeviceType.Unknown } }
            });

            expect(mockService.updateDevice).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to update device',
                expect.objectContaining({ id: 'test-1' })
            );
        });

        it('should reject an update-device message with an empty fingerprint object rather than wiping the existing fingerprint', async () => {
            mockService.getDevice.mockResolvedValue({
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.Z8 }
            });

            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { name: 'Updated device', fingerprint: {} }
            });

            expect(mockFingerprintService.updateDeviceFingerprint).not.toHaveBeenCalled();
            expect(mockService.updateDevice).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to update device',
                expect.objectContaining({ id: 'test-1' })
            );
        });

        it('should reject an update-device message with a missing device type', async () => {
            await view.handleMessage({
                type: 'update-device',
                id: 'test-1',
                updates: { fingerprint: { deviceType: undefined } }
            });

            expect(mockService.updateDevice).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to update device',
                expect.objectContaining({ id: 'test-1' })
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
                id: 'test-1'
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
                id: 'test-1'
            });

            expect(mockService.getDevice).toHaveBeenCalledWith('test-1');
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
            expect(mockService.deleteDevice).not.toHaveBeenCalled();
        });

        it('should handle connect-device message', async () => {
            await view.handleMessage({
                type: 'connect-device',
                id: 'test-1',
                newWindow: false
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
                newWindow: true
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
                type: 'discover-devices'
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
                id: 'test-1'
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
                id: 'nonexistent'
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
                connectxGroupService: mockGroupService,
                deviceFingerprintService: mockFingerprintService
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
                connectxGroupService: mockGroupService,
                deviceFingerprintService: mockFingerprintService
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

        it('should send warning to webview when deleting a paired device', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.getGroupForDevice.mockResolvedValue({
                id: 'group-1',
                deviceIds: ['test-1', 'test-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            });

            await view.handleMessage({
                type: 'delete-device',
                id: 'test-1'
            });

            expect(mockGroupService.getGroupForDevice).toHaveBeenCalledWith('test-1');
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'show-paired-delete-warning',
                deviceId: 'test-1',
                deviceName: 'Test device',
                groupId: 'group-1'
            });
            expect(mockService.deleteDevice).not.toHaveBeenCalled();
        });

        it('should use standard confirmation for unpaired device', async () => {
            const vscode = require('vscode');
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.getGroupForDevice.mockResolvedValue(undefined);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');

            await view.handleMessage({
                type: 'delete-device',
                id: 'test-1'
            });

            expect(mockGroupService.getGroupForDevice).toHaveBeenCalledWith('test-1');
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
            expect(mockService.deleteDevice).toHaveBeenCalledWith('test-1');
        });
    });

    describe('confirm-delete-paired-device', () => {
        it('should send show-password-input-for-delete to webview', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});

            await view.handleMessage({
                type: 'confirm-delete-paired-device',
                id: 'test-1',
                groupId: 'group-1'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'show-password-input-for-delete',
                deviceId: 'test-1',
                groupId: 'group-1'
            });
        });
    });

    describe('password-submitted-for-delete', () => {
        it('should unconfigure group and delete device when password is provided', async () => {
            const vscode = require('vscode');
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue({ success: true });

            await view.handleMessage({
                type: 'password-submitted-for-delete',
                password: 'sudo-pass',
                deviceId: 'test-1',
                groupId: 'group-1'
            });

            expect(mockGroupService.removeGroupAndUnconfigureNICs).toHaveBeenCalledWith('group-1', 'sudo-pass');
            expect(mockService.deleteDevice).toHaveBeenCalledWith('test-1');
            expect(mockLogger.debug).toHaveBeenCalledWith('Paired device deleted', {
                id: 'test-1',
                deviceName: 'Test device',
                groupId: 'group-1'
            });
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('should show warning when unconfiguration succeeds with nonFatalError', async () => {
            const vscode = require('vscode');
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue({
                success: true,
                nonFatalError: 'Failed to unconfigure device: incorrect sudo password'
            });

            await view.handleMessage({
                type: 'password-submitted-for-delete',
                password: 'wrong-pass',
                deviceId: 'test-1',
                groupId: 'group-1'
            });

            // Device should still be deleted
            expect(mockService.deleteDevice).toHaveBeenCalledWith('test-1');
            // Warning should be shown to the user
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'NIC unconfiguration had issues during paired device deletion',
                { id: 'test-1', groupId: 'group-1', error: 'Failed to unconfigure device: incorrect sudo password' }
            );
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Device "Test device" was deleted and the pairing was removed, but the ConnectX network configuration could not be removed from one or more devices due to an unexpected error.'
            );
        });

        it('should abort device deletion and throw when group removal fails', async () => {
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue({
                success: false,
                error: 'Store failure: could not persist group removal'
            });

            await expect(view.handleMessage({
                type: 'password-submitted-for-delete',
                password: 'sudo-pass',
                deviceId: 'test-1',
                groupId: 'group-1'
            })).rejects.toThrow('Store failure: could not persist group removal');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to remove group during paired device deletion; aborting device delete to prevent orphaned group',
                { id: 'test-1', groupId: 'group-1', error: 'Store failure: could not persist group removal' }
            );
            // Device must NOT be deleted — group still exists in the store
            expect(mockService.deleteDevice).not.toHaveBeenCalled();
        });

        it('should throw error when device not found for paired deletion', async () => {
            mockService.getDevice.mockResolvedValue(undefined);

            await expect(view.handleMessage({
                type: 'password-submitted-for-delete',
                password: 'sudo-pass',
                deviceId: 'test-1',
                groupId: 'group-1'
            })).rejects.toThrow('device not found: test-1');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for paired deletion',
                { id: 'test-1' }
            );
        });

        it('should throw error when device deletion fails', async () => {
            mockService.getDevice.mockResolvedValue(mockDevice);
            mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue({ success: true });
            const error = new Error('Deletion failed');
            mockService.deleteDevice.mockRejectedValue(error);

            await expect(view.handleMessage({
                type: 'password-submitted-for-delete',
                password: 'sudo-pass',
                deviceId: 'test-1',
                groupId: 'group-1'
            })).rejects.toThrow('Deletion failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to delete paired device',
                { error, id: 'test-1', groupId: 'group-1' }
            );
        });
    });

    describe('password-input-cancelled-for-delete', () => {
        it('should log cancellation and not delete device', async () => {
            await view.handleMessage({
                type: 'password-input-cancelled-for-delete',
                deviceId: 'test-1'
            });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Paired device deletion cancelled - password input dismissed',
                { id: 'test-1' }
            );
            expect(mockGroupService.removeGroupAndUnconfigureNICs).not.toHaveBeenCalled();
            expect(mockService.deleteDevice).not.toHaveBeenCalled();
        });
    });

    describe('connectDevice', () => {
        it('should handle DeviceNeedsSetupError and navigate to setup', async () => {
            const { DeviceNeedsSetupError } = await import('../../services/deviceService.js');
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
            expect(mockDiscoveryService.discoverDevices).toHaveBeenCalledWith(5000);
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryCompleted',
                devices: mockDiscoveredDevices
            });
            expect(mockLogger.info).toHaveBeenCalledWith('Discovery completed', { count: 1 });
        });

        it('should send empty-state presentation on discovery with no results', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.discoverDevices.mockResolvedValue([]);

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryCompleted',
                devices: [],
                emptyStateTitle: 'No devices found.',
                emptyStateCode: 'ZTK-DISCO-NO-DEVICES'
            });
            expect(mockLogger.info).toHaveBeenCalledWith('Discovery completed', { count: 0 });
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
                error: 'Discovery failed',
                errorTitle: 'Discovery failed.',
                errorCode: 'ZTK-DISCO-UNKNOWN'
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Discovery failed', { error });
        });

        it('should map expected discovery failures to support codes', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            const error = new Error('Timed out waiting for mDNS responses');
            mockDiscoveryService.discoverDevices.mockRejectedValue(error);

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'discoveryError',
                errorTitle: 'Discovery timed out.',
                errorCode: 'ZTK-DISCO-TIMEOUT'
            }));
        });

        const expectTypedDiscoveryFailure = async (
            error: DeviceDiscoveryError,
            expectedTitle: string,
            expectedCode: string
        ): Promise<void> => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.discoverDevices.mockRejectedValue(error);

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'discoveryError',
                errorTitle: expectedTitle,
                errorCode: expectedCode
            }));
        };

        it('should map permission discovery failures from typed errors to support codes', async () => {
            await expectTypedDiscoveryFailure(
                new DeviceDiscoveryError('permission', 'permission denied while browsing'),
                'Device discovery needs network access.',
                'ZTK-DISCO-PERMISSION'
            );
        });

        it('should map service discovery failures from typed errors to support codes', async () => {
            await expectTypedDiscoveryFailure(
                new DeviceDiscoveryError('service', 'bonjour service unavailable'),
                'The discovery service is unavailable.',
                'ZTK-DISCO-SERVICE'
            );
        });

        it('should map network discovery failures from typed errors to support codes', async () => {
            await expectTypedDiscoveryFailure(
                new DeviceDiscoveryError('network', 'No active network interfaces found'),
                'Network discovery is unavailable.',
                'ZTK-DISCO-NETWORK'
            );
        });

        it('should handle non-Error exceptions in discovery', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');
            mockDiscoveryService.discoverDevices.mockRejectedValue('String error');

            await view.handleMessage({
                type: 'discover-devices'
            });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Discovery failed',
                errorTitle: 'Discovery failed.',
                errorCode: 'ZTK-DISCO-UNKNOWN'
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

        it('should exclude delete warning params from lastRenderParams', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            await view.render({
                showDeleteWarningForDeviceId: 'test-1',
                deleteWarningDeviceName: 'Test device',
                deleteWarningGroupId: 'group-1'
            });

            // lastRenderParams should NOT contain the one-time delete warning params
            const lastParams = (view as any).lastRenderParams;
            expect(lastParams).not.toHaveProperty('showDeleteWarningForDeviceId');
            expect(lastParams).not.toHaveProperty('deleteWarningDeviceName');
            expect(lastParams).not.toHaveProperty('deleteWarningGroupId');
        });

        it('should schedule warning overlay message when showDeleteWarningForDeviceId is provided', async () => {
            jest.useFakeTimers();
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);
            mockService.getDevice.mockResolvedValue(mockDevice);

            await view.render({
                showDeleteWarningForDeviceId: 'test-1',
                deleteWarningDeviceName: 'Test device',
                deleteWarningGroupId: 'group-1'
            });

            // Message should not have been sent yet (it's scheduled via setTimeout)
            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-paired-delete-warning' })
            );

            // Advance timers to trigger the scheduled message
            jest.advanceTimersByTime(100);

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'show-paired-delete-warning',
                deviceId: 'test-1',
                deviceName: 'Test device',
                groupId: 'group-1'
            });

            jest.useRealTimers();
        });

        it('should not schedule warning overlay message when delete warning params are absent', async () => {
            jest.useFakeTimers();
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({ showAddForm: true });

            jest.advanceTimersByTime(200);

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-paired-delete-warning' })
            );

            jest.useRealTimers();
        });
    });

    describe('ZRT one-time product announcement', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should schedule the ZRT announcement message when it has not been seen and no delete warning is pending', async () => {
            jest.useFakeTimers();
            jest.spyOn(extensionStateService, 'hasSeenZrtAnnouncement').mockReturnValue(false);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({});

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-announcement' })
            );

            jest.advanceTimersByTime(100);

            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-announcement' })
            );

            jest.useRealTimers();
        });

        it('should not schedule the ZRT announcement when it has already been seen', async () => {
            jest.useFakeTimers();
            jest.spyOn(extensionStateService, 'hasSeenZrtAnnouncement').mockReturnValue(true);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({});
            jest.advanceTimersByTime(200);

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-announcement' })
            );

            jest.useRealTimers();
        });

        it('should not schedule the ZRT announcement when a paired delete warning is pending instead', async () => {
            jest.useFakeTimers();
            jest.spyOn(extensionStateService, 'hasSeenZrtAnnouncement').mockReturnValue(false);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({
                showDeleteWarningForDeviceId: 'test-1',
                deleteWarningDeviceName: 'Test device',
                deleteWarningGroupId: 'group-1'
            });
            jest.advanceTimersByTime(200);

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-announcement' })
            );
            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-paired-delete-warning' })
            );

            jest.useRealTimers();
        });

        it('should mark the announcement as seen when dismissed', async () => {
            const setSeenSpy = jest.spyOn(extensionStateService, 'setZrtAnnouncementSeen').mockResolvedValue(undefined);

            await view.handleMessage({ type: 'zrt-announcement-dismiss' } as any);

            expect(setSeenSpy).toHaveBeenCalled();
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: TelemetryEventType.Announcement,
                    action: 'dismiss',
                    properties: expect.objectContaining({ announcementId: 'zrt-intro' })
                })
            );
        });

        it('should mark the announcement as seen and open the learn more URL', async () => {
            const setSeenSpy = jest.spyOn(extensionStateService, 'setZrtAnnouncementSeen').mockResolvedValue(undefined);

            await view.handleMessage({ type: 'zrt-announcement-learn-more' } as any);

            expect(setSeenSpy).toHaveBeenCalled();
            expect(vscode.Uri.parse).toHaveBeenCalledWith(URLS.ZRT_LEARN_MORE);
            expect(vscode.env.openExternal).toHaveBeenCalled();
            const calledArg = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
            expect(calledArg.toString()).toBe(URLS.ZRT_LEARN_MORE);
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: TelemetryEventType.Announcement,
                    action: 'learn-more',
                    properties: expect.objectContaining({ announcementId: 'zrt-intro' })
                })
            );
        });
    });

    describe('ZRT info modal (from sidebar Quick Links navigation)', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should schedule the ZRT info modal message when showZrtInfoModal param is provided', async () => {
            jest.useFakeTimers();
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({ showZrtInfoModal: true, zrtLogoUri: 'zrt-logo-uri' });

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-info' })
            );

            jest.advanceTimersByTime(100);

            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-info', zrtLogoUri: 'zrt-logo-uri' })
            );

            jest.useRealTimers();
        });

        it('should not schedule the ZRT announcement when the info modal is requested instead', async () => {
            jest.useFakeTimers();
            jest.spyOn(extensionStateService, 'hasSeenZrtAnnouncement').mockReturnValue(false);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({ showZrtInfoModal: true });
            jest.advanceTimersByTime(200);

            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-info' })
            );
            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-announcement' })
            );

            jest.useRealTimers();
        });

        it('should not schedule the ZRT info modal when a paired delete warning is pending instead', async () => {
            jest.useFakeTimers();
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockImplementation(() => {});
            mockService.getAllDevices.mockResolvedValue([mockDevice]);

            await view.render({
                showZrtInfoModal: true,
                showDeleteWarningForDeviceId: 'test-1',
                deleteWarningDeviceName: 'Test device',
                deleteWarningGroupId: 'group-1'
            });
            jest.advanceTimersByTime(200);

            expect(sendMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-zrt-info' })
            );
            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'show-paired-delete-warning' })
            );

            jest.useRealTimers();
        });

        it('should open the learn more URL without touching the announcement seen state', async () => {
            const setAnnouncementSeenSpy = jest.spyOn(extensionStateService, 'setZrtAnnouncementSeen').mockResolvedValue(undefined);

            await view.handleMessage({ type: 'zrt-info-learn-more' } as any);

            expect(setAnnouncementSeenSpy).not.toHaveBeenCalled();
            expect(vscode.Uri.parse).toHaveBeenCalledWith(URLS.ZRT_LEARN_MORE);
            expect(vscode.env.openExternal).toHaveBeenCalled();
            const calledArg = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
            expect(calledArg.toString()).toBe(URLS.ZRT_LEARN_MORE);
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: TelemetryEventType.QuickLink,
                    action: 'learn-more',
                    properties: expect.objectContaining({ linkId: 'zrt-info' })
                })
            );
        });

        it('should track telemetry when the ZRT info modal is dismissed', async () => {
            await view.handleMessage({ type: 'zrt-info-close' } as any);

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: TelemetryEventType.QuickLink,
                    action: 'close',
                    properties: expect.objectContaining({ linkId: 'zrt-info' })
                })
            );
        });
    });

    describe('paired group action links', () => {
        const mockDevice1: Device = {
            id: 'device-1',
            name: 'Device A',
            host: '192.168.1.100',
            username: 'root',
            port: 22,
            isSetup: false,
            useKeyAuth: false,
            keySetup: { keyGenerated: false, keyCopied: false, connectionTested: false },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z'
        };

        const mockDevice2: Device = {
            id: 'device-2',
            name: 'Device B',
            host: '192.168.1.101',
            username: 'root',
            port: 22,
            isSetup: false,
            useKeyAuth: false,
            keySetup: { keyGenerated: false, keyCopied: false, connectionTested: false },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z'
        };

        it('should render Pairing Details link inside each paired group container', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([{
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            }]);

            const html = await view.render();

            expect(html).toContain('Pairing Details');
            expect(html).toContain('data-action="pairing-details"');
            expect(html).toContain('data-group-id="group-1"');
        });

        it('should render Unpair Devices link inside each paired group container', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([{
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            }]);

            const html = await view.render();

            expect(html).toContain('Unpair Devices');
            expect(html).toContain('data-action="unpair-devices"');
        });

        it('should render action links with correct group-id for each group', async () => {
            const mockDevice3: Device = {
                id: 'device-3',
                name: 'Device C',
                host: '192.168.1.102',
                username: 'root',
                port: 22,
                isSetup: false,
                useKeyAuth: false,
                keySetup: { keyGenerated: false, keyCopied: false, connectionTested: false },
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            const mockDevice4: Device = {
                id: 'device-4',
                name: 'Device D',
                host: '192.168.1.103',
                username: 'root',
                port: 22,
                isSetup: false,
                useKeyAuth: false,
                keySetup: { keyGenerated: false, keyCopied: false, connectionTested: false },
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2, mockDevice3, mockDevice4]);
            mockGroupService.getAllGroups.mockResolvedValue([
                {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z'
                },
                {
                    id: 'group-2',
                    deviceIds: ['device-3', 'device-4'],
                    createdAt: '2025-01-02T00:00:00Z',
                    updatedAt: '2025-01-02T00:00:00Z'
                }
            ]);

            const html = await view.render();

            expect(html).toContain('data-group-id="group-1"');
            expect(html).toContain('data-group-id="group-2"');
            // Strip embedded <script> blocks before counting to avoid matching
            // selector strings like querySelectorAll('[data-action="pairing-details"]')
            const templateHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');
            const pairingDetailsMatches = templateHtml.match(/data-action="pairing-details"/g);
            const unpairMatches = templateHtml.match(/data-action="unpair-devices"/g);
            // One button per action per group (2 groups → 2 matches each)
            expect(pairingDetailsMatches?.length).toBe(2);
            expect(unpairMatches?.length).toBe(2);
        });

        it('should not render action links when no paired groups exist', async () => {
            mockService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).not.toContain('data-group-id="');
        });
    });

    describe('pairing-details', () => {
        it('should navigate to pair details view with the correct groupId', async () => {
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'pairing-details',
                groupId: 'group-1'
            });

            expect(navigateToSpy).toHaveBeenCalledWith('groups/pairDetails', { groupId: 'group-1' });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Navigating to pair details view',
                { groupId: 'group-1' }
            );
        });

        it('should navigate to pair details view for a different groupId', async () => {
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'pairing-details',
                groupId: 'group-abc-123'
            });

            expect(navigateToSpy).toHaveBeenCalledWith('groups/pairDetails', { groupId: 'group-abc-123' });
        });
    });

    describe('unpair-devices', () => {
        it('should navigate to unpair devices view with the correct groupId', async () => {
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'unpair-devices',
                groupId: 'group-1'
            });

            expect(navigateToSpy).toHaveBeenCalledWith('groups/unpairDevices', { groupId: 'group-1' });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Navigating to unpair devices view',
                { groupId: 'group-1' }
            );
        });

        it('should navigate to unpair devices view for a different groupId', async () => {
            const navigateToSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'unpair-devices',
                groupId: 'group-xyz-789'
            });

            expect(navigateToSpy).toHaveBeenCalledWith('groups/unpairDevices', { groupId: 'group-xyz-789' });
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
                error: 'Device rediscovery failed',
                errorTitle: 'Discovery failed.',
                errorCode: 'ZTK-DISCO-UNKNOWN'
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
                error: 'Device rediscovery failed',
                errorTitle: 'Discovery failed.',
                errorCode: 'ZTK-DISCO-UNKNOWN'
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

        it('should trim DNS instance names before rediscovery', async () => {
            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: '  xyz123  '
            });

            expect(mockDiscoveryService.rediscoverDevices).toHaveBeenCalledWith(['xyz123'], undefined);
        });

        it('should reject rediscovery messages without a DNS instance name', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview');

            await view.handleMessage({
                type: 'rediscover-device',
                deviceId: 'test-1',
                dnsInstanceName: undefined
            } as any);

            expect(mockDiscoveryService.rediscoverDevices).not.toHaveBeenCalled();
            expect(sendMessageSpy).toHaveBeenCalledTimes(1);
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'discoveryError',
                error: 'Missing DNS instance name for device rediscovery',
                errorTitle: 'Discovery failed.',
                errorCode: 'ZTK-DISCO-UNKNOWN'
            });
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
                devices: [],
                emptyStateTitle: 'No devices found.',
                emptyStateCode: 'ZTK-DISCO-NO-DEVICES'
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
