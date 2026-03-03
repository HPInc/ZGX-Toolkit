/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { PairDetailsViewController } from '../../views/groups/pairDetails/pairDetailsViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { ConnectXGroupService } from '../../services';
import { Device } from '../../types/devices';
import { ConnectXGroupInfo, ConnectXNIC } from '../../types/connectxGroup';

describe('PairDetailsView', () => {
    let view: PairDetailsViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockGroupService: jest.Mocked<ConnectXGroupService>;
    let mockNavigationCallback: jest.Mock;

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
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
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
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };

    const mockGroupInfo: ConnectXGroupInfo = {
        group: {
            id: 'group-1',
            deviceIds: ['device-1', 'device-2'],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z'
        },
        devices: [mockDevice1, mockDevice2]
    };

    const mockNicsDevice1: ConnectXNIC[] = [
        { linuxDeviceName: 'enp1s0f0', ipv4Address: '10.0.0.1' },
        { linuxDeviceName: 'enp1s0f1', ipv4Address: '10.0.1.1' }
    ];

    const mockNicsDevice2: ConnectXNIC[] = [
        { linuxDeviceName: 'enp2s0f0', ipv4Address: '10.0.0.2' }
    ];

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as any;

        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockGroupService = {
            createGroup: jest.fn(),
            createGroupAndConfigureNICs: jest.fn(),
            getAllGroups: jest.fn().mockResolvedValue([]),
            getGroup: jest.fn(),
            getGroupInfo: jest.fn(),
            getConnectXNICsForDevice: jest.fn(),
            deleteGroup: jest.fn(),
            removeGroup: jest.fn(),
            subscribe: jest.fn().mockReturnValue(() => {}),
        } as any;

        mockNavigationCallback = jest.fn();

        view = new PairDetailsViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectxGroupService: mockGroupService
        });

        view.setNavigationCallback(mockNavigationCallback);
    });

    afterEach(() => {
        view.dispose();
        jest.clearAllMocks();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(PairDetailsViewController.viewId()).toBe('groups/pairDetails');
        });
    });

    describe('render', () => {
        describe('with valid group data', () => {
            it('should render network table when devices have NICs with IPs', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockResolvedValueOnce(mockNicsDevice2);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Device One');
                expect(html).toContain('Device Two');
                expect(html).toContain('enp1s0f0');
                expect(html).toContain('enp1s0f1');
                expect(html).toContain('enp2s0f0');
                expect(html).toContain('10.0.0.1');
                expect(html).toContain('10.0.1.1');
                expect(html).toContain('10.0.0.2');
            });

            it('should render the network table container when data exists', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockResolvedValueOnce(mockNicsDevice2);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('network-table');
                expect(html).not.toContain('No network information available');
            });

            it('should show device name only for the first NIC of each device', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                // Device 1 has two NICs with IPs
                mockGroupService.getConnectXNICsForDevice.mockResolvedValue(mockNicsDevice1);

                const html = await view.render({ groupId: 'group-1' });

                // The device name should appear once, and the second row should have an empty td
                // Count occurrences of 'Device One' in table rows
                const deviceNameMatches = html.match(/Device One/g);
                expect(deviceNameMatches).toHaveLength(1);
            });
        });

        describe('IP address filtering', () => {
            it('should only show NICs that have IP addresses', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                // Mix of NICs with and without IPs
                const mixedNics: ConnectXNIC[] = [
                    { linuxDeviceName: 'enp1s0f0', ipv4Address: '10.0.0.1' },
                    { linuxDeviceName: 'enp1s0f1', ipv4Address: '' },
                    { linuxDeviceName: 'enp1s0f2', ipv4Address: '10.0.0.3' }
                ];
                mockGroupService.getConnectXNICsForDevice.mockResolvedValue(mixedNics);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('enp1s0f0');
                expect(html).toContain('10.0.0.1');
                expect(html).toContain('enp1s0f2');
                expect(html).toContain('10.0.0.3');
                // NIC without IP should be filtered out
                expect(html).not.toContain('enp1s0f1');
            });

            it('should show fallback when all NICs lack IP addresses', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                const nicsWithoutIp: ConnectXNIC[] = [
                    { linuxDeviceName: 'enp1s0f0', ipv4Address: '' },
                    { linuxDeviceName: 'enp1s0f1', ipv4Address: '' }
                ];
                mockGroupService.getConnectXNICsForDevice.mockResolvedValue(nicsWithoutIp);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No ConnectX NIC with IP found');
                expect(html).not.toContain('enp1s0f0');
                expect(html).not.toContain('enp1s0f1');
            });

            it('should handle device with empty NIC list', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                mockGroupService.getConnectXNICsForDevice.mockResolvedValue([]);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No ConnectX NIC with IP found');
            });

            it('should process each device independently for NIC filtering', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                // Device 1: has NICs with IPs
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce([
                        { linuxDeviceName: 'enp1s0f0', ipv4Address: '10.0.0.1' }
                    ])
                    // Device 2: all NICs lack IPs
                    .mockResolvedValueOnce([
                        { linuxDeviceName: 'enp2s0f0', ipv4Address: '' }
                    ]);

                const html = await view.render({ groupId: 'group-1' });

                // Device 1 should show its NIC
                expect(html).toContain('enp1s0f0');
                expect(html).toContain('10.0.0.1');
                // Device 2 should show fallback
                expect(html).toContain('No ConnectX NIC with IP found');
                expect(html).not.toContain('enp2s0f0');
            });
        });

        describe('with no group data', () => {
            it('should render no-data message when groupId is not provided', async () => {
                const html = await view.render();

                expect(html).toContain('No network information available');
                expect(html).toContain('no-data-message');
                expect(mockLogger.warn).toHaveBeenCalledWith('No groupId provided to pair details view');
            });

            it('should render no-data message when groupId is undefined in params', async () => {
                const html = await view.render({});

                expect(html).toContain('No network information available');
                expect(mockLogger.warn).toHaveBeenCalledWith('No groupId provided to pair details view');
            });

            it('should render no-data message when getGroupInfo returns undefined', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(undefined);

                const html = await view.render({ groupId: 'nonexistent-group' });

                expect(html).toContain('No network information available');
                expect(html).toContain('no-data-message');
            });
        });

        describe('error handling', () => {
            it('should handle getGroupInfo failure gracefully', async () => {
                mockGroupService.getGroupInfo.mockRejectedValue(new Error('Service unavailable'));

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No network information available');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to load pair details',
                    expect.objectContaining({
                        groupId: 'group-1',
                        error: 'Service unavailable'
                    })
                );
            });

            it('should handle non-Error exception in getGroupInfo', async () => {
                mockGroupService.getGroupInfo.mockRejectedValue('string error');

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No network information available');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to load pair details',
                    expect.objectContaining({
                        error: 'string error'
                    })
                );
            });

            it('should handle NIC discovery failure for a single device', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockRejectedValueOnce(new Error('SSH connection failed'));

                const html = await view.render({ groupId: 'group-1' });

                // Device 1 should still show its NICs
                expect(html).toContain('Device One');
                expect(html).toContain('enp1s0f0');
                expect(html).toContain('10.0.0.1');
                // Device 2 should show error
                expect(html).toContain('Device Two');
                expect(html).toContain('Error discovering NICs');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to discover ConnectX NICs for device',
                    expect.objectContaining({
                        device: 'Device Two',
                        error: 'SSH connection failed'
                    })
                );
            });

            it('should handle non-Error NIC discovery exception', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                mockGroupService.getConnectXNICsForDevice
                    .mockRejectedValue('unexpected failure');

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Error discovering NICs');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to discover ConnectX NICs for device',
                    expect.objectContaining({
                        device: 'Device One',
                        error: 'unexpected failure'
                    })
                );
            });

            it('should handle NIC discovery failure for all devices', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockRejectedValueOnce(new Error('Connection timeout'))
                    .mockRejectedValueOnce(new Error('Authentication failed'));

                const html = await view.render({ groupId: 'group-1' });

                // Both devices should show error entries
                expect(html).toContain('Device One');
                expect(html).toContain('Device Two');
                // Should have two error entries
                const errorMatches = html.match(/Error discovering NICs/g);
                expect(errorMatches).toHaveLength(2);
                expect(mockLogger.error).toHaveBeenCalledTimes(2);
            });
        });

        describe('telemetry', () => {
            it('should track view navigation with network entry count', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)  // 2 NICs for device 1
                    .mockResolvedValueOnce(mockNicsDevice2); // 1 NIC for device 2

                await view.render({ groupId: 'group-1' });

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        eventType: TelemetryEventType.View,
                        action: 'navigate',
                        properties: {
                            toView: 'groups.pairDetails',
                        },
                        measurements: {
                            networkEntryCount: 3
                        }
                    })
                );
            });

            it('should track zero count when no data available', async () => {
                await view.render();

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        measurements: {
                            networkEntryCount: 0
                        }
                    })
                );
            });

            it('should track entry count including error entries', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1) // 2 NICs
                    .mockRejectedValueOnce(new Error('err')); // 1 error entry

                await view.render({ groupId: 'group-1' });

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        measurements: {
                            networkEntryCount: 3
                        }
                    })
                );
            });

            it('should track entry count including fallback entries', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue({
                    ...mockGroupInfo,
                    devices: [mockDevice1]
                });
                mockGroupService.getConnectXNICsForDevice.mockResolvedValue([]);

                await view.render({ groupId: 'group-1' });

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        measurements: {
                            networkEntryCount: 1
                        }
                    })
                );
            });
        });

        describe('HTML structure', () => {
            it('should include the close button', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockResolvedValueOnce(mockNicsDevice2);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('closeBtn');
            });

            it('should include the pair details header', async () => {
                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Pairing Details');
            });

            it('should include network information description', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockResolvedValueOnce(mockNicsDevice2);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Network Information');
                expect(html).toContain('high-speed NVIDIA ConnectX cable');
            });

            it('should include table headers', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                mockGroupService.getConnectXNICsForDevice
                    .mockResolvedValueOnce(mockNicsDevice1)
                    .mockResolvedValueOnce(mockNicsDevice2);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Device Name');
                expect(html).toContain('NVIDIA ConnectX Network Interface');
                expect(html).toContain('IP Address');
            });
        });

        describe('logging', () => {
            it('should log debug when rendering with params', async () => {
                await view.render({ groupId: 'group-1' });

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Rendering pair details view',
                    { groupId: 'group-1' }
                );
            });

            it('should log debug when rendering without params', async () => {
                await view.render();

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Rendering pair details view',
                    undefined
                );
            });
        });
    });

    describe('handleMessage', () => {
        it('should navigate to device manager on cancel', async () => {
            await view.handleMessage({ type: 'cancel' });

            expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Pair details closed, navigating to device manager'
            );
        });

        it('should log warning for unknown message types', async () => {
            await view.handleMessage({ type: 'unknown-action' } as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Unknown message type',
                { type: 'unknown-action' }
            );
            expect(mockNavigationCallback).not.toHaveBeenCalled();
        });
    });

    describe('loadNetworkEntries', () => {
        it('should return empty array when group has zero devices', async () => {
            mockGroupService.getGroupInfo.mockResolvedValue({
                group: {
                    id: 'group-1',
                    deviceIds: [],
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z'
                },
                devices: []
            });

            const html = await view.render({ groupId: 'group-1' });

            expect(html).toContain('No network information available');
            expect(mockGroupService.getConnectXNICsForDevice).not.toHaveBeenCalled();
        });
    });

    describe('discoverNICsForDevice', () => {
        it('should set showDeviceName correctly for each device in a multi-device group', async () => {
            const mockDevice3: Device = {
                id: 'device-3',
                name: 'Device Three',
                host: '192.168.1.102',
                username: 'root',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z'
            };

            mockGroupService.getGroupInfo.mockResolvedValue({
                group: {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2', 'device-3'],
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z'
                },
                devices: [mockDevice1, mockDevice2, mockDevice3]
            });

            // Device 1: 2 NICs, Device 2: 2 NICs, Device 3: 1 NIC
            mockGroupService.getConnectXNICsForDevice
                .mockResolvedValueOnce([
                    { linuxDeviceName: 'enp1s0f0', ipv4Address: '10.0.0.1' },
                    { linuxDeviceName: 'enp1s0f1', ipv4Address: '10.0.0.2' }
                ])
                .mockResolvedValueOnce([
                    { linuxDeviceName: 'enp2s0f0', ipv4Address: '10.0.1.1' },
                    { linuxDeviceName: 'enp2s0f1', ipv4Address: '10.0.1.2' }
                ])
                .mockResolvedValueOnce([
                    { linuxDeviceName: 'enp3s0f0', ipv4Address: '10.0.2.1' }
                ]);

            const html = await view.render({ groupId: 'group-1' });

            // Each device name should appear exactly once (only on first NIC row)
            expect(html.match(/Device One/g)).toHaveLength(1);
            expect(html.match(/Device Two/g)).toHaveLength(1);
            expect(html.match(/Device Three/g)).toHaveLength(1);
            // All 5 NICs should be present
            expect(html).toContain('enp1s0f0');
            expect(html).toContain('enp1s0f1');
            expect(html).toContain('enp2s0f0');
            expect(html).toContain('enp2s0f1');
            expect(html).toContain('enp3s0f0');
        });

        it('should handle mixed results: NICs with IPs, NICs without IPs, and errors across devices', async () => {
            const mockDevice3: Device = {
                id: 'device-3',
                name: 'Device Three',
                host: '192.168.1.102',
                username: 'root',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z'
            };

            mockGroupService.getGroupInfo.mockResolvedValue({
                group: {
                    id: 'group-1',
                    deviceIds: ['device-1', 'device-2', 'device-3'],
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z'
                },
                devices: [mockDevice1, mockDevice2, mockDevice3]
            });

            // Device 1: has NICs with IPs
            mockGroupService.getConnectXNICsForDevice
                .mockResolvedValueOnce([
                    { linuxDeviceName: 'enp1s0f0', ipv4Address: '10.0.0.1' }
                ])
                // Device 2: all NICs lack IPs
                .mockResolvedValueOnce([
                    { linuxDeviceName: 'enp2s0f0', ipv4Address: '' }
                ])
                // Device 3: discovery fails
                .mockRejectedValueOnce(new Error('Connection refused'));

            const html = await view.render({ groupId: 'group-1' });

            // Device 1: NIC with IP shown
            expect(html).toContain('enp1s0f0');
            expect(html).toContain('10.0.0.1');
            // Device 2: fallback shown, NIC name not shown
            expect(html).toContain('No ConnectX NIC with IP found');
            expect(html).not.toContain('enp2s0f0');
            // Device 3: error shown
            expect(html).toContain('Error discovering NICs');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to discover ConnectX NICs for device',
                expect.objectContaining({ device: 'Device Three' })
            );
        });
    });

    describe('re-rendering', () => {
        it('should update state when re-rendered with a different groupId', async () => {
            // First render with group-1
            mockGroupService.getGroupInfo.mockResolvedValue({
                ...mockGroupInfo,
                devices: [mockDevice1]
            });
            mockGroupService.getConnectXNICsForDevice.mockResolvedValue(mockNicsDevice1);

            const html1 = await view.render({ groupId: 'group-1' });

            expect(html1).toContain('Device One');
            expect(mockGroupService.getGroupInfo).toHaveBeenCalledWith('group-1');

            // Second render with group-2
            mockGroupService.getGroupInfo.mockResolvedValue({
                group: {
                    id: 'group-2',
                    deviceIds: ['device-2'],
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z'
                },
                devices: [mockDevice2]
            });
            mockGroupService.getConnectXNICsForDevice.mockResolvedValue(mockNicsDevice2);

            const html2 = await view.render({ groupId: 'group-2' });

            expect(html2).toContain('Device Two');
            expect(html2).not.toContain('Device One');
            expect(mockGroupService.getGroupInfo).toHaveBeenCalledWith('group-2');
        });

        it('should handle re-rendering from valid group to no groupId', async () => {
            // First render with valid group
            mockGroupService.getGroupInfo.mockResolvedValue({
                ...mockGroupInfo,
                devices: [mockDevice1]
            });
            mockGroupService.getConnectXNICsForDevice.mockResolvedValue(mockNicsDevice1);

            const html1 = await view.render({ groupId: 'group-1' });
            expect(html1).toContain('Device One');

            // Second render without groupId
            const html2 = await view.render({});

            expect(html2).toContain('No network information available');
            expect(html2).not.toContain('Device One');
        });
    });
});
