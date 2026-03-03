/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { UnpairDevicesViewController } from '../../views/groups/unpairDevices/unpairDevicesViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { ConnectXGroupService } from '../../services';
import { Device } from '../../types/devices';
import { ConnectXGroupInfo } from '../../types/connectxGroup';

describe('UnpairDevicesView', () => {
    let view: UnpairDevicesViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockGroupService: jest.Mocked<ConnectXGroupService>;
    let mockNavigationCallback: jest.Mock;
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
            removeGroupAndUnconfigureNICs: jest.fn(),
            subscribe: jest.fn().mockReturnValue(() => {}),
        } as any;

        mockNavigationCallback = jest.fn();
        mockMessageCallback = jest.fn();

        view = new UnpairDevicesViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectxGroupService: mockGroupService
        });

        view.setNavigationCallback(mockNavigationCallback);
        view.setMessageCallback(mockMessageCallback);
    });

    afterEach(() => {
        view.dispose();
        jest.clearAllMocks();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(UnpairDevicesViewController.viewId()).toBe('groups/unpairDevices');
        });
    });

    describe('render', () => {
        describe('with valid group data', () => {
            it('should render device names from the group', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Device One');
                expect(html).toContain('Device Two');
            });

            it('should call getGroupInfo with the correct groupId', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                await view.render({ groupId: 'group-1' });

                expect(mockGroupService.getGroupInfo).toHaveBeenCalledWith('group-1');
            });

            it('should track telemetry view event with device count', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                await view.render({ groupId: 'group-1' });

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        eventType: TelemetryEventType.View,
                        action: 'navigate',
                        properties: {
                            toView: 'groups.unpairDevices',
                        },
                        measurements: {
                            deviceCount: 2
                        }
                    })
                );
            });
        });

        describe('HTML structure', () => {
            it('should contain the unpair devices header', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('Unpair Devices');
                expect(html).toContain('codicon-debug-disconnect');
            });

            it('should contain cancel and confirm unpair buttons', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('cancelBtn');
                expect(html).toContain('confirmUnpairBtn');
                expect(html).toContain('Cancel');
                expect(html).toContain('Confirm Unpair');
            });

            it('should contain descriptive text', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('The following devices will be unpaired.');
                expect(html).toContain('Are you sure you want to continue?');
            });

            it('should contain device name list items', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('device-name-list');
                expect(html).toContain('device-name-item');
            });
        });

        describe('without groupId', () => {
            it('should render empty state when no groupId provided', async () => {
                const html = await view.render({});

                expect(html).toContain('No devices found in this group');
                expect(mockLogger.warn).toHaveBeenCalledWith('No groupId provided to unpair devices view');
            });

            it('should render empty state when params are undefined', async () => {
                const html = await view.render(undefined);

                expect(html).toContain('No devices found in this group');
            });

            it('should track telemetry with zero device count', async () => {
                await view.render({});

                expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        measurements: {
                            deviceCount: 0
                        }
                    })
                );
            });
        });

        describe('with invalid group data', () => {
            it('should render empty state when getGroupInfo returns undefined', async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(undefined as any);

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No devices found in this group');
            });

            it('should render empty state when getGroupInfo rejects', async () => {
                mockGroupService.getGroupInfo.mockRejectedValue(new Error('Network error'));

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No devices found in this group');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to load group devices',
                    expect.objectContaining({
                        groupId: 'group-1',
                        error: 'Network error'
                    })
                );
            });

            it('should handle non-Error thrown by getGroupInfo', async () => {
                mockGroupService.getGroupInfo.mockRejectedValue('string error');

                const html = await view.render({ groupId: 'group-1' });

                expect(html).toContain('No devices found in this group');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to load group devices',
                    expect.objectContaining({
                        error: 'string error'
                    })
                );
            });
        });

        describe('re-rendering', () => {
            it('should re-render with different group data', async () => {
                const singleDeviceGroupInfo: ConnectXGroupInfo = {
                    group: {
                        id: 'group-2',
                        deviceIds: ['device-1'],
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z'
                    },
                    devices: [mockDevice1]
                };

                mockGroupService.getGroupInfo
                    .mockResolvedValueOnce(mockGroupInfo)
                    .mockResolvedValueOnce(singleDeviceGroupInfo);

                const html1 = await view.render({ groupId: 'group-1' });
                expect(html1).toContain('Device One');
                expect(html1).toContain('Device Two');

                const html2 = await view.render({ groupId: 'group-2' });
                expect(html2).toContain('Device One');
                expect(html2).not.toContain('Device Two');
            });
        });
    });

    describe('handleMessage', () => {
        describe('cancel', () => {
            it('should navigate to device manager', async () => {
                await view.handleMessage({ type: 'cancel' } as any);

                expect(mockNavigationCallback).toHaveBeenCalledWith('devices/manager', undefined, undefined);
            });

            it('should log the cancellation', async () => {
                await view.handleMessage({ type: 'cancel' } as any);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Unpair devices cancelled, navigating to device manager'
                );
            });
        });

        describe('confirm-unpair', () => {
            beforeEach(async () => {
                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                await view.render({ groupId: 'group-1' });
            });

            it('should send show-password-input message to webview', async () => {
                await view.handleMessage({ type: 'confirm-unpair' } as any);

                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-password-input',
                        deviceIds: [],
                        deviceNames: ['Device One', 'Device Two']
                    })
                );
            });

            it('should show error overlay when groupId is not available', async () => {
                // Create a new view without rendering (no groupId set)
                const freshView = new UnpairDevicesViewController({
                    logger: mockLogger,
                    telemetry: mockTelemetry,
                    connectxGroupService: mockGroupService
                });
                freshView.setMessageCallback(mockMessageCallback);

                await freshView.handleMessage({ type: 'confirm-unpair' } as any);

                expect(mockLogger.error).toHaveBeenCalledWith('Cannot unpair: no groupId available');
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Cannot Unpair Devices'
                    })
                );

                freshView.dispose();
            });
        });

        describe('password-submitted', () => {
            let mockNavigationCallbackForPassword: jest.Mock;

            beforeEach(async () => {
                mockNavigationCallbackForPassword = jest.fn();
                view.setNavigationCallback(mockNavigationCallbackForPassword);
                (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

                mockGroupService.getGroupInfo.mockResolvedValue(mockGroupInfo);
                await view.render({ groupId: 'group-1' });
            });

            it('should call removeGroupAndUnconfigureNICs with groupId and password', async () => {
                const mockResult = {
                    success: true,
                    message: 'Group removed and NICs unconfigured'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockGroupService.removeGroupAndUnconfigureNICs).toHaveBeenCalledWith(
                    'group-1',
                    'test-password'
                );
            });

            it('should navigate to device manager on success', async () => {
                const mockResult = {
                    success: true,
                    message: 'Group removed and NICs unconfigured'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockNavigationCallbackForPassword).toHaveBeenCalledWith('devices/manager', undefined, undefined);
            });

            it('should show success notification on success', async () => {
                const mockResult = {
                    success: true,
                    message: 'Group removed and NICs unconfigured'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                    'Devices have been unpaired successfully.',
                    { title: 'Dismiss' }
                );
            });

            it('should show warning notification when nonFatalError is present', async () => {
                const mockResult = {
                    success: true,
                    nonFatalError: 'Could not unconfigure NIC on one device',
                    message: 'Group removed'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                    'Devices have been unpaired. However, there were issues unconfiguring ConnectX NICs on one or more devices.',
                    { title: 'Dismiss' }
                );
            });

            it('should log success with groupId', async () => {
                const mockResult = {
                    success: true,
                    message: 'Group removed and NICs unconfigured'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'Devices unpaired successfully',
                    { groupId: 'group-1' }
                );
            });

            it('should show error overlay on failure', async () => {
                const mockResult = {
                    success: false,
                    error: 'Invalid password',
                    message: 'Failed to remove group'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'wrong-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Failed to Unpair Devices',
                        error: 'Invalid password',
                        buttonText: 'Retry'
                    })
                );
            });

            it('should log error and track telemetry on failure', async () => {
                const mockResult = {
                    success: false,
                    error: 'Invalid password',
                    message: 'Failed to remove group'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'wrong-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to unpair devices',
                    expect.objectContaining({
                        error: 'Invalid password',
                        groupId: 'group-1'
                    })
                );

                expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: 'groups.unpairDevices.removeAndUnconfigure'
                    })
                );
            });

            it('should use generic error message when error string is not provided', async () => {
                const mockResult = {
                    success: false,
                    message: 'Failed'
                };
                mockGroupService.removeGroupAndUnconfigureNICs.mockResolvedValue(mockResult);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to unpair devices',
                    expect.objectContaining({
                        error: 'Failed to unpair devices'
                    })
                );
            });

            it('should show error overlay on unexpected exception', async () => {
                const unexpectedError = new Error('Unexpected error');
                mockGroupService.removeGroupAndUnconfigureNICs.mockRejectedValue(unexpectedError);

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Unexpected error during device unpairing',
                    expect.objectContaining({
                        error: 'Unexpected error',
                        groupId: 'group-1'
                    })
                );

                expect(mockTelemetry.trackError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: 'groups.unpairDevices'
                    })
                );

                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Unexpected Error',
                        buttonText: 'Retry'
                    })
                );
            });

            it('should handle non-Error thrown exception', async () => {
                mockGroupService.removeGroupAndUnconfigureNICs.mockRejectedValue('string error');

                await view.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: ['Device One', 'Device Two']
                });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Unexpected error during device unpairing',
                    expect.objectContaining({
                        error: 'string error'
                    })
                );
            });

            it('should show error overlay when groupId is not available', async () => {
                const freshView = new UnpairDevicesViewController({
                    logger: mockLogger,
                    telemetry: mockTelemetry,
                    connectxGroupService: mockGroupService
                });
                freshView.setMessageCallback(mockMessageCallback);

                await freshView.handleMessage({
                    type: 'password-submitted',
                    password: 'test-password',
                    deviceIds: [],
                    deviceNames: []
                });

                expect(mockLogger.error).toHaveBeenCalledWith('Cannot unpair: no groupId available');
                expect(mockMessageCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'show-error-overlay',
                        errorTitle: 'Cannot Unpair Devices'
                    })
                );

                freshView.dispose();
            });
        });

        describe('password-input-cancelled', () => {
            it('should send unpair-error message to re-enable buttons', async () => {
                await view.handleMessage({ type: 'password-input-cancelled' } as any);

                expect(mockLogger.info).toHaveBeenCalledWith('Password input cancelled');
                expect(mockMessageCallback).toHaveBeenCalledWith({
                    type: 'unpair-error'
                });
            });
        });

        describe('close-error-overlay', () => {
            it('should send unpair-error message to re-enable buttons', async () => {
                await view.handleMessage({ type: 'close-error-overlay' } as any);

                expect(mockLogger.info).toHaveBeenCalledWith('Error overlay closed on unpair devices view');
                expect(mockMessageCallback).toHaveBeenCalledWith({
                    type: 'unpair-error'
                });
            });
        });

        describe('unknown message', () => {
            it('should log warning for unknown message type', async () => {
                await view.handleMessage({ type: 'unknown-type' } as any);

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'Unknown message type',
                    { type: 'unknown-type' }
                );
            });
        });
    });
});
