/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { PairDevicesViewController } from '../../views/groups/pairDevices/pairDevicesViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { DeviceService, ConnectXGroupService, DeviceHealthCheckService } from '../../services';
import { Device } from '../../types/devices';
import { ConnectXGroup } from '../../types/connectxGroup';

describe('PairDevicesView', () => {
    let view: PairDevicesViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockGroupService: jest.Mocked<ConnectXGroupService>;
    let mockHealthCheckService: jest.Mocked<DeviceHealthCheckService>;
    let mockMessageCallback: jest.Mock;

    const mockDevice1: Device = {
        id: 'device-1',
        name: 'Device One',
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
        name: 'Device Two',
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

    const mockDeviceUnsetup: Device = {
        id: 'device-unsetup',
        name: 'Unsetup Device',
        host: '192.168.1.102',
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

    const mockGroup: ConnectXGroup = {
        id: 'group-1',
        deviceIds: ['device-3'],
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

        // Create mock device service
        mockDeviceService = {
            createDevice: jest.fn(),
            updateDevice: jest.fn(),
            deleteDevice: jest.fn(),
            connectToDevice: jest.fn(),
            getDevice: jest.fn(),
            getAllDevices: jest.fn().mockResolvedValue([]),
            subscribe: jest.fn().mockReturnValue(() => {}),
        } as any;

        // Create mock group service
        mockGroupService = {
            createGroup: jest.fn(),
            createGroupAndConfigureNICs: jest.fn(),
            getAllGroups: jest.fn().mockResolvedValue([]),
            getGroup: jest.fn(),
            deleteGroup: jest.fn(),
            removeGroup: jest.fn(),
            subscribe: jest.fn().mockImplementation((callback: (groups: ConnectXGroup[]) => void) => () => {}),
        } as any;

        // Create mock health check service
        mockHealthCheckService = {
            checkDeviceHealth: jest.fn().mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            }),
        } as any;

        // Create mock message callback
        mockMessageCallback = jest.fn();

        view = new PairDevicesViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService,
            connectxGroupService: mockGroupService,
            deviceHealthCheckService: mockHealthCheckService
        });

        view.setMessageCallback(mockMessageCallback);
    });

    afterEach(() => {
        view.dispose();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(PairDevicesViewController.viewId()).toBe('groups/pairDevices');
        });
    });

    describe('render', () => {
        it('should render empty state when no devices exist', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('No devices available for pairing');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering pair devices view',
                undefined
            );
        });

        it('should render device list when devices exist', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('Device One');
            expect(html).toContain('Device Two');
            expect(html).not.toContain('No devices available for pairing');
        });

        it('should mark devices already in groups as paired', async () => {
            const groupWithDevice = {
                ...mockGroup,
                deviceIds: ['device-1']
            };
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([groupWithDevice]);

            const html = await view.render();

            // Device 1 should be marked as paired
            expect(html).toContain('Device One');
            expect(html).toContain('Device Two');
            // The paired badge should appear
            expect(html).toContain('Paired');
        });

        it('should sort unpaired devices before paired devices', async () => {
            const groupWithDevice = {
                ...mockGroup,
                deviceIds: ['device-1']
            };
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([groupWithDevice]);

            const html = await view.render();

            // Device Two (unpaired) should appear before Device One (paired)
            const device2Index = html.indexOf('Device Two');
            const device1Index = html.indexOf('Device One');
            expect(device2Index).toBeLessThan(device1Index);
        });

        it('should track telemetry on render', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            await view.render();

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'navigate',
                    properties: {
                        toView: 'groups.pairDevices',
                    },
                    measurements: {
                        availableDeviceCount: 2,
                        totalDeviceCount: 2
                    }
                })
            );
        });

        it('should include error overlay HTML', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('error-overlay');
        });

        it('should include password input overlay HTML', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('password-input-overlay');
        });

        it('should include base overlay functionality', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            // Should include base overlay scripts and styles
            expect(html).toContain('BaseOverlay');
        });

        it('should exclude devices that have not completed initial setup', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDeviceUnsetup]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('Device One');
            expect(html).not.toContain('Unsetup Device');
        });

        it('should show empty state when all devices are unsetup', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDeviceUnsetup]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const html = await view.render();

            expect(html).toContain('No devices available for pairing');
            expect(html).not.toContain('Unsetup Device');
        });

        it('should not count unsetup devices toward availableDeviceCount telemetry', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDeviceUnsetup]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            await view.render();

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        availableDeviceCount: 1,
                        totalDeviceCount: 1
                    }
                })
            );
        });

        it('should not count unsetup devices that are in groups', async () => {
            // An unsetup device that is somehow already in a group should still be hidden
            const groupWithUnsetup = { ...mockGroup, deviceIds: ['device-unsetup'] };
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDeviceUnsetup]);
            mockGroupService.getAllGroups.mockResolvedValue([groupWithUnsetup]);

            const html = await view.render();

            expect(html).not.toContain('Unsetup Device');
            expect(html).toContain('Device One');
        });
    });

    describe('handleMessage', () => {
        let mockNavigationCallback: jest.Mock;

        beforeEach(() => {
            mockNavigationCallback = jest.fn();
            view.setNavigationCallback(mockNavigationCallback);
            // Reset the vscode mock
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
        });

        describe('pair-devices', () => {
            it('should prompt for password on successful health check', async () => {
                mockDeviceService.getDevice
                    .mockResolvedValueOnce(mockDevice1)
                    .mockResolvedValueOnce(mockDevice2);
                mockHealthCheckService.checkDeviceHealth
                    .mockResolvedValueOnce({ isHealthy: true, device: 'Device One' })
                    .mockResolvedValueOnce({ isHealthy: true, device: 'Device Two' });

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                expect(mockHealthCheckService.checkDeviceHealth).toHaveBeenCalledTimes(2);
                
                // Should send password input prompt (group creation happens after password submission)
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-password-input',
                        deviceIds: ['device-1', 'device-2'],
                        deviceNames: ['Device One', 'Device Two']
                    })
                );
                
                // Should NOT navigate or create group yet (happens after password submission)
                expect(mockNavigationCallback).not.toHaveBeenCalled();
                expect(mockGroupService.createGroup).not.toHaveBeenCalled();
                expect(mockGroupService.createGroupAndConfigureNICs).not.toHaveBeenCalled();
            });

            it('should handle invalid device count', async () => {
                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1']
                });

                // Should send pair-error for validation
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pair-error',
                        error: 'Please select exactly 2 devices to pair'
                    })
                );

                // Should not attempt to fetch devices or check health
                expect(mockDeviceService.getDevice).not.toHaveBeenCalled();
                expect(mockHealthCheckService.checkDeviceHealth).not.toHaveBeenCalled();
            });

            it('should reject pairing when more than 2 devices selected', async () => {
                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2', 'device-3']
                });

                expect(mockGroupService.createGroup).not.toHaveBeenCalled();
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pair-error',
                        error: 'Please select exactly 2 devices to pair'
                    })
                );
            });

            it('should reject pairing when no devices selected', async () => {
                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: []
                });

                expect(mockGroupService.createGroup).not.toHaveBeenCalled();
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pair-error',
                        error: 'Please select exactly 2 devices to pair'
                    })
                );
            });

            it('should reject pairing when deviceIds is undefined', async () => {
                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: undefined as any
                });

                expect(mockGroupService.createGroup).not.toHaveBeenCalled();
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pair-error',
                        error: 'Please select exactly 2 devices to pair'
                    })
                );
            });

            it('should handle device not found', async () => {
                mockDeviceService.getDevice
                    .mockResolvedValueOnce(mockDevice1)
                    .mockResolvedValueOnce(undefined); // Device 2 not found

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                // Should log error
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'One or more selected devices could not be found',
                    expect.objectContaining({
                        deviceIds: ['device-1', 'device-2']
                    })
                );

                // Should track telemetry error
                expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        error: expect.any(Error),
                        context: 'groups.pairDevices.deviceNotFound'
                    })
                );

                // Should show error overlay
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Device Not Available',
                        buttonText: 'Return to Device Manager',
                        onClose: 'cancel', // Primary button should navigate to device manager
                        secondaryButton: undefined // No secondary button
                    })
                );

                // Should not check health
                expect(mockHealthCheckService.checkDeviceHealth).not.toHaveBeenCalled();
            });

            it('should handle health check failure', async () => {
                mockDeviceService.getDevice
                    .mockResolvedValueOnce(mockDevice1)
                    .mockResolvedValueOnce(mockDevice2);
                mockHealthCheckService.checkDeviceHealth
                    .mockResolvedValueOnce({ isHealthy: false, device: 'Device One', error: 'SSH connection failed' })
                    .mockResolvedValueOnce({ isHealthy: true, device: 'Device Two' });

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                // Should log error
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Device connectivity test failed during pairing',
                    expect.objectContaining({
                        failedDevices: ['Device One'],
                        deviceIds: ['device-1', 'device-2']
                    })
                );

                // Should track telemetry error
                expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        error: expect.any(Error),
                        context: 'groups.pairDevices.healthCheck'
                    })
                );

                // Should show error overlay with device names
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Device pairing cannot be completed at this time',
                        errorDetails: expect.stringContaining('Device One'),
                        buttonText: 'Retry'
                    })
                );

                // Should not prompt for password
                expect(mockMessageCallback).not.toHaveBeenCalledWith(
                    expect.objectContaining({ type: 'show-password-input' })
                );
            });

            it('should include error details in error overlay', async () => {
                mockDeviceService.getDevice
                    .mockResolvedValueOnce(mockDevice1)
                    .mockResolvedValueOnce(mockDevice2);
                mockHealthCheckService.checkDeviceHealth
                    .mockResolvedValueOnce({ isHealthy: false, device: 'Device One', error: 'Connection refused' })
                    .mockResolvedValueOnce({ isHealthy: true, device: 'Device Two' });

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                // Verify error overlay contains the specific error message
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        error: expect.stringContaining('Connection refused')
                    })
                );
            });

            it('should show error overlay when multiple devices fail health check', async () => {
                mockDeviceService.getDevice
                    .mockResolvedValueOnce(mockDevice1)
                    .mockResolvedValueOnce(mockDevice2);
                mockHealthCheckService.checkDeviceHealth
                    .mockResolvedValueOnce({ isHealthy: false, device: 'Device One', error: 'Connection refused' })
                    .mockResolvedValueOnce({ isHealthy: false, device: 'Device Two', error: 'Timeout' });

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Device connectivity test failed during pairing',
                    expect.objectContaining({
                        failedDevices: ['Device One', 'Device Two']
                    })
                );
                
                // Error overlay should include both device names in errorDetails
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorDetails: expect.stringContaining('Device One'),
                        buttonText: 'Retry'
                    })
                );
                
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorDetails: expect.stringContaining('Device Two'),
                        buttonText: 'Retry'
                    })
                );
            });

            it('should handle unexpected exceptions during pairing', async () => {
                mockDeviceService.getDevice.mockRejectedValue(new Error('Unexpected error'));

                await view.handleMessage({
                    type: 'pair-devices',
                    deviceIds: ['device-1', 'device-2']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Unexpected error during device pairing',
                    expect.objectContaining({
                        error: 'Unexpected error'
                    })
                );

                // Should track telemetry
                expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        error: expect.any(Error),
                        context: 'groups.pairDevices'
                    })
                );

                // Should show error overlay
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Unexpected Error',
                        buttonText: 'Retry'
                    })
                );
            });
        });

        describe('cancel', () => {
            it('should navigate to device manager on cancel', async () => {
                const mockNavigationCallback = jest.fn();
                view.setNavigationCallback(mockNavigationCallback);

                await view.handleMessage({
                    type: 'cancel'
                });

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Pair devices cancelled, navigating to device manager'
                );
                expect(mockNavigationCallback).toHaveBeenCalledWith(
                    'devices/manager',
                    undefined,
                    undefined
                );
            });

            it('should navigate to device manager when error overlay "Return to Device Manager" is clicked', async () => {
                // The "Return to Device Manager" button in the error overlay sends a 'cancel' message
                // This test documents that the cancel handler serves both the Cancel button
                // and the error overlay's secondary button
                const mockNavigationCallback = jest.fn();
                view.setNavigationCallback(mockNavigationCallback);

                // Simulate clicking "Return to Device Manager" on error overlay
                // (which sends the same 'cancel' message as the Cancel button)
                await view.handleMessage({
                    type: 'cancel'
                });

                expect(mockNavigationCallback).toHaveBeenCalledWith(
                    'devices/manager',
                    undefined,
                    undefined
                );
            });
        });

        describe('close-error-overlay', () => {
            it('should handle close-error-overlay message and send reset-pairing-state', async () => {
                await view.handleMessage({
                    type: 'close-error-overlay'
                });

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'Error overlay closed on pair devices view'
                );
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'reset-pairing-state'
                    })
                );
            });
        });

        describe('unknown message', () => {
            it('should log warning for unknown message types', async () => {
                await view.handleMessage({
                    type: 'unknown-type' as any
                });

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'Unknown message type',
                    { type: 'unknown-type' }
                );
            });
        });
    });

    describe('dispose', () => {
        it('should unsubscribe from both device and group stores on dispose', () => {
            const deviceUnsubscribeMock = jest.fn();
            const groupUnsubscribeMock = jest.fn();
            mockDeviceService.subscribe.mockReturnValue(deviceUnsubscribeMock);
            mockGroupService.subscribe.mockReturnValue(groupUnsubscribeMock);

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });

            newView.dispose();

            expect(deviceUnsubscribeMock).toHaveBeenCalled();
            expect(groupUnsubscribeMock).toHaveBeenCalled();
        });
    });

    describe('store subscription', () => {
        it('should refresh view when device store updates', async () => {
            let storeCallback: () => void = () => {};
            mockDeviceService.subscribe.mockImplementation((callback) => {
                storeCallback = callback;
                return () => {};
            });
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            newView.setMessageCallback(mockMessageCallback);

            // Initial render
            await newView.render();

            // Simulate store update
            storeCallback();

            // Wait for async refresh
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockLogger.trace).toHaveBeenCalledWith(
                'Device store updated, refreshing pair devices view'
            );

            newView.dispose();
        });

        it('should log error when refresh fails after store update', async () => {
            let storeCallback: () => void = () => {};
            mockDeviceService.subscribe.mockImplementation((callback) => {
                storeCallback = callback;
                return () => {};
            });

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            // Note: NOT setting refreshCallback, so refresh will warn but not error

            // Simulate store update
            storeCallback();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            // When no refresh callback is set, baseViewController logs a warning
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Cannot refresh: no refresh callback set',
                expect.objectContaining({ view: 'PairDevicesViewController' })
            );

            newView.dispose();
        });

        it('should refresh view when group store updates', async () => {
            let groupStoreCallback: (groups: ConnectXGroup[]) => void = () => {};
            mockGroupService.subscribe.mockImplementation((callback) => {
                groupStoreCallback = callback;
                return () => {};
            });
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            newView.setMessageCallback(mockMessageCallback);

            // Initial render
            await newView.render();

            // Simulate group store update
            groupStoreCallback([]);

            // Wait for async refresh
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockLogger.trace).toHaveBeenCalledWith(
                'Group store updated, refreshing pair devices view'
            );

            newView.dispose();
        });

        it('should refresh when group changes affect paired state', async () => {
            let groupStoreCallback: (groups: ConnectXGroup[]) => void = () => {};
            mockGroupService.subscribe.mockImplementation((callback) => {
                groupStoreCallback = callback;
                return () => {};
            });
            
            // Initially no groups
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1, mockDevice2]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            const mockRefreshCallback = jest.fn();
            newView.setRefreshCallback(mockRefreshCallback);

            // Now add a group (simulating device pairing in another view)
            const newGroup: ConnectXGroup = {
                id: 'new-group',
                deviceIds: ['device-1'],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
            };
            mockGroupService.getAllGroups.mockResolvedValue([newGroup]);

            // Trigger group store update with the new group
            groupStoreCallback([newGroup]);

            // Wait for async refresh
            await new Promise(resolve => setTimeout(resolve, 10));

            // View should refresh to show device-1 as now paired
            expect(mockRefreshCallback).toHaveBeenCalled();

            newView.dispose();
        });

        it('should suppress device store refresh during pairing', async () => {
            let deviceStoreCallback: () => void = () => {};
            mockDeviceService.subscribe.mockImplementation((callback) => {
                deviceStoreCallback = callback;
                return () => {};
            });

            // Simulate a slow createGroupAndConfigureNICs that triggers store updates mid-operation
            let resolveCreateGroup: (value: any) => void = () => {};
            mockGroupService.createGroupAndConfigureNICs.mockImplementation(() => {
                return new Promise((resolve) => {
                    resolveCreateGroup = resolve;
                    // Simulate store update triggered by group creation before NIC config completes
                    deviceStoreCallback();
                });
            });

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            const mockRefreshCallback = jest.fn();
            newView.setRefreshCallback(mockRefreshCallback);
            newView.setMessageCallback(mockMessageCallback);

            // Start the password-submitted handler (triggers pairing)
            const handleMessagePromise = newView.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Wait for store callback to fire (during createGroupAndConfigureNICs)
            await new Promise(resolve => setTimeout(resolve, 10));

            // Store-triggered refresh should be suppressed during pairing
            expect(mockRefreshCallback).not.toHaveBeenCalled();
            expect(mockLogger.trace).toHaveBeenCalledWith(
                'Device store updated during pairing, skipping refresh'
            );

            // Complete the pairing operation with failure
            resolveCreateGroup({
                success: false,
                error: 'Bad password',
                message: 'Failed'
            });
            await handleMessagePromise;

            // Error overlay should be shown
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Failed to Pair Devices'
                })
            );

            newView.dispose();
        });

        it('should suppress group store refresh during pairing', async () => {
            let groupStoreCallback: (groups: any[]) => void = () => {};
            mockGroupService.subscribe.mockImplementation((callback) => {
                groupStoreCallback = callback;
                return () => {};
            });

            // Simulate a slow createGroupAndConfigureNICs that triggers store updates mid-operation
            let resolveCreateGroup: (value: any) => void = () => {};
            mockGroupService.createGroupAndConfigureNICs.mockImplementation(() => {
                return new Promise((resolve) => {
                    resolveCreateGroup = resolve;
                    // Simulate group store update triggered by group creation
                    groupStoreCallback([]);
                });
            });

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            const mockRefreshCallback = jest.fn();
            newView.setRefreshCallback(mockRefreshCallback);
            newView.setMessageCallback(mockMessageCallback);

            // Start the password-submitted handler (triggers pairing)
            const handleMessagePromise = newView.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Wait for store callback to fire
            await new Promise(resolve => setTimeout(resolve, 10));

            // Store-triggered refresh should be suppressed during pairing
            expect(mockRefreshCallback).not.toHaveBeenCalled();
            expect(mockLogger.trace).toHaveBeenCalledWith(
                'Group store updated during pairing, skipping refresh'
            );

            // Complete the pairing operation with failure
            resolveCreateGroup({
                success: false,
                error: 'Bad password',
                message: 'Failed'
            });
            await handleMessagePromise;

            newView.dispose();
        });

        it('should re-enable store refreshes after pairing failure', async () => {
            let deviceStoreCallback: () => void = () => {};
            mockDeviceService.subscribe.mockImplementation((callback) => {
                deviceStoreCallback = callback;
                return () => {};
            });
            mockDeviceService.getAllDevices.mockResolvedValue([mockDevice1]);
            mockGroupService.getAllGroups.mockResolvedValue([]);

            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue({
                success: false,
                error: 'Bad password',
                message: 'Failed'
            });

            const newView = new PairDevicesViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                connectxGroupService: mockGroupService,
                deviceHealthCheckService: mockHealthCheckService
            });
            const mockRefreshCallback = jest.fn();
            newView.setRefreshCallback(mockRefreshCallback);
            newView.setMessageCallback(mockMessageCallback);

            // Complete pairing with failure
            await newView.handleMessage({
                type: 'password-submitted',
                password: 'wrong-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // After pairing completes, store-triggered refresh should work again
            deviceStoreCallback();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockLogger.trace).toHaveBeenCalledWith(
                'Device store updated, refreshing pair devices view'
            );

            newView.dispose();
        });
    });

    describe('password-submitted', () => {
        let mockNavigationCallback: jest.Mock;

        beforeEach(() => {
            mockNavigationCallback = jest.fn();
            view.setNavigationCallback(mockNavigationCallback);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
        });

        it('should create group, configure ConnectX NICs and show success notification', async () => {
            const mockResult = {
                success: true,
                group: { id: 'new-group-id', deviceIds: ['device-1', 'device-2'], createdAt: '', updatedAt: '' },
                message: 'Group created and NICs configured'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            expect(mockGroupService.createGroupAndConfigureNICs).toHaveBeenCalledWith(
                { deviceIds: ['device-1', 'device-2'] },
                'test-password'
            );

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Group created and ConnectX NICs configured successfully',
                expect.objectContaining({
                    groupId: 'new-group-id',
                    deviceIds: ['device-1', 'device-2']
                })
            );

            // Should navigate to device manager
            expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);

            // Should show success notification
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Devices "Device One" and "Device Two" are now paired and ready for use.',
                { title: 'Dismiss' },
                { title: 'Pair More Devices' }
            );

            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'pair-success',
                    message: 'Devices paired and ConnectX NICs configured successfully',
                    groupId: 'new-group-id'
                })
            );
        });

        it('should navigate to pair devices when "Pair More Devices" is clicked', async () => {
            const mockResult = {
                success: true,
                group: { id: 'new-group-id', deviceIds: ['device-1', 'device-2'], createdAt: '', updatedAt: '' },
                message: 'Group created and NICs configured'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue({ title: 'Pair More Devices' });

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Should navigate to device manager first, then to pair devices
            expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);
            expect(mockNavigationCallback).toHaveBeenCalledWith('groups/pairDevices', undefined, undefined);
        });

        it('should not navigate to pair devices when user dismisses notification', async () => {
            const mockResult = {
                success: true,
                group: { id: 'new-group-id', deviceIds: ['device-1', 'device-2'], createdAt: '', updatedAt: '' },
                message: 'Group created and NICs configured'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);
            // Simulate user clicking "Dismiss"
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue({ title: 'Dismiss' });

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Should only navigate to device manager, not to pair devices
            expect(mockNavigationCallback).toHaveBeenCalledTimes(1);
            expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);
            expect(mockNavigationCallback).not.toHaveBeenCalledWith('groups/pairDevices', undefined, undefined);
        });

        it('should not navigate when user closes notification without selecting', async () => {
            const mockResult = {
                success: true,
                group: { id: 'new-group-id', deviceIds: ['device-1', 'device-2'], createdAt: '', updatedAt: '' },
                message: 'Group created and NICs configured'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);
            // Simulate user closing notification without clicking a button
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Should only navigate to device manager
            expect(mockNavigationCallback).toHaveBeenCalledTimes(1);
            expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);
        });

        it('should handle group creation and NIC configuration failure', async () => {
            const mockResult = {
                success: false,
                error: 'Configuration failed: Invalid password',
                message: 'Failed to configure'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);

            await view.handleMessage({
                type: 'password-submitted',
                password: 'wrong-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to create group and configure ConnectX NICs',
                expect.objectContaining({
                    error: 'Configuration failed: Invalid password',
                    deviceIds: ['device-1', 'device-2']
                })
            );

            expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: 'groups.pairDevices.createAndConfigure'
                })
            );

            // Should show error overlay with secondary button
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Failed to Pair Devices',
                    error: 'Configuration failed: Invalid password',
                    buttonText: 'Retry Pairing',
                    onClose: 'close-error-overlay',
                    secondaryButton: {
                        text: 'Return to Device Manager',
                        onClick: 'cancel'
                    }
                })
            );
        });

        it('should handle group creation error with generic message', async () => {
            const mockResult = {
                success: false,
                error: 'Connection timeout',
                message: 'Failed'
            };
            mockGroupService.createGroupAndConfigureNICs.mockResolvedValue(mockResult);

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to create group and configure ConnectX NICs',
                expect.objectContaining({
                    error: 'Connection timeout',
                    deviceIds: ['device-1', 'device-2']
                })
            );

            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Failed to Pair Devices',
                    error: 'Connection timeout',
                    secondaryButton: {
                        text: 'Return to Device Manager',
                        onClick: 'cancel'
                    }
                })
            );
        });

        it('should handle unexpected errors during group creation and configuration', async () => {
            const unexpectedError = new Error('Unexpected error');
            mockGroupService.createGroupAndConfigureNICs.mockRejectedValue(unexpectedError);

            await view.handleMessage({
                type: 'password-submitted',
                password: 'test-password',
                deviceIds: ['device-1', 'device-2'],
                deviceNames: ['Device One', 'Device Two']
            });

            // Should log the unexpected error
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Unexpected error during group creation and configuration',
                expect.objectContaining({
                    error: 'Unexpected error',
                    deviceIds: ['device-1', 'device-2']
                })
            );

            // Should still show error overlay to user
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Failed to Pair Devices'
                })
            );
        });
    });

    describe('password-input-cancelled', () => {
        it('should handle password input cancellation', async () => {
            await view.handleMessage({
                type: 'password-input-cancelled'
            });

            expect(mockLogger.info).toHaveBeenCalledWith('Password input cancelled');
            expect(mockMessageCallback).toHaveBeenCalledWith({
                type: 'pairing-cancelled'
            });
        });
    });
});
