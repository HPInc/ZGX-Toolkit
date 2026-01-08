/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppCompleteViewController } from '../../views/apps/complete/appCompleteViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { DeviceService, ConnectionService } from '../../services';
import { Device } from '../../types/devices';
import { Message } from '../../types/messages';

describe('AppCompleteViewController', () => {
    let view: AppCompleteViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockConnectionService: jest.Mocked<ConnectionService>;

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
            updateDevice: jest.fn().mockResolvedValue(undefined),
            deleteDevice: jest.fn(),
            connectToDevice: jest.fn(),
            getDevice: jest.fn().mockResolvedValue(mockDevice),
            getAllDevices: jest.fn().mockResolvedValue([]),
            subscribe: jest.fn().mockReturnValue(() => {}),
        } as any;

        // Create mock connection service
        mockConnectionService = {
            connectViaRemoteSSH: jest.fn().mockResolvedValue(undefined),
        } as any;

        view = new AppCompleteViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService,
            connectionService: mockConnectionService,
        });
    });

    afterEach(() => {
        view.dispose();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(AppCompleteViewController.viewId()).toBe('apps/complete');
        });
    });

    describe('render', () => {
        it('should throw error when no device is provided', async () => {
            await expect(view.render()).rejects.toThrow('device required for app complete view');
            expect(mockLogger.error).toHaveBeenCalledWith('No device provided to app complete view');
        });

        it('should render successful installation with single app', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['ollama'],
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            expect(html).toContain('Ollama');
            expect(html).toContain('🎉');
            expect(mockDeviceService.updateDevice).toHaveBeenCalledWith('device-1', mockDevice);
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'apps.complete',
                },
                measurements: {
                    successCount: 1,
                    failureCount: 0
                }
            });
        });

        it('should render successful installation with multiple apps', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['ollama', 'podman', 'miniforge'],
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            expect(html).toContain('Ollama');
            expect(html).toContain('Podman');
            expect(html).toContain('Miniforge');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        successCount: 3,
                        failureCount: 0
                    }
                })
            );
        });

        it('should render failed installation with error reason', async () => {
            const html = await view.render({
                device: mockDevice,
                failedApps: ['ollama'],
                errorReason: 'password',
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            expect(html).toContain('⚠️');
            expect(html).toContain('Installation Failed');
            expect(html).toContain('Unable to install applications');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        successCount: 0,
                        failureCount: 1
                    }
                })
            );
        });

        it('should render partial success with some failures', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['podman'],
                failedApps: ['ollama'],
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            expect(html).toContain('⚠️');
            expect(html).toContain('Podman');
            expect(html).toContain('Ollama');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        successCount: 1,
                        failureCount: 1
                    }
                })
            );
        });

        it('should render uninstall operation correctly', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['ollama'],
                operation: 'uninstall'
            });

            expect(html).toContain('Test Device');
            expect(html).toContain('Uninstall');
            expect(html).toContain('Uninstallation');
            expect(html).toContain('uninstalled');
            expect(html).toContain('Uninstalled');
        });

        it('should show Ollama inference option when Ollama is installed', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['ollama'],
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            // The template should show inference-related content when Ollama is installed
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering app complete view',
                expect.objectContaining({
                    device: 'Test Device',
                    installedCount: 1,
                    failedCount: 0,
                    operation: 'install'
                })
            );
        });

        it('should handle empty installed and failed arrays', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: [],
                failedApps: [],
                operation: 'install'
            });

            expect(html).toContain('Test Device');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: {
                        successCount: 0,
                        failureCount: 0
                    }
                })
            );
        });

        it('should default to install operation when not specified', async () => {
            const html = await view.render({
                device: mockDevice,
                installedApps: ['docker']
            });

            expect(html).toContain('Install');
            expect(html).toContain('Installation');
        });
    });

    describe('handleMessage', () => {
        beforeEach(() => {
            // Mock navigateTo
            view['navigateTo'] = jest.fn().mockResolvedValue(undefined);
        });

        it('should handle connect-device message', async () => {
            const message: Message = {
                type: 'connect-device',
                id: 'device-1'
            };

            await view.handleMessage(message);

            expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
            expect(mockConnectionService.connectViaRemoteSSH).toHaveBeenCalledWith(mockDevice, true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Connect device request from apps/complete view',
                { deviceId: 'device-1' }
            );
        });

        it('should handle connect-device message when device not found', async () => {
            mockDeviceService.getDevice.mockResolvedValue(undefined);

            const message: Message = {
                type: 'connect-device',
                id: 'non-existent'
            };

            await view.handleMessage(message);

            expect(mockConnectionService.connectViaRemoteSSH).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for connection',
                { deviceId: 'non-existent' }
            );
        });

        it('should handle continue-to-inference message', async () => {
            const message: Message = {
                type: 'continue-to-inference',
                deviceId: 'device-1'
            };

            await view.handleMessage(message);

            expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
            expect(view['navigateTo']).toHaveBeenCalledWith(
                'instructions/inference',
                { device: mockDevice }
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Continuing to inference instructions',
                { deviceId: 'device-1' }
            );
        });

        it('should handle continue-to-inference when device not found', async () => {
            mockDeviceService.getDevice.mockResolvedValue(undefined);

            const message: Message = {
                type: 'continue-to-inference',
                deviceId: 'non-existent'
            };

            await view.handleMessage(message);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for inference instructions',
                { deviceId: 'non-existent' }
            );
        });

        it('should handle retry-failed message', async () => {
            const message: Message = {
                type: 'retry-failed',
                deviceId: 'device-1',
                operation: 'install',
                failedApps: ['ollama', 'docker']
            };

            await view.handleMessage(message);

            expect(mockDeviceService.getDevice).toHaveBeenCalledWith('device-1');
            expect(view['navigateTo']).toHaveBeenCalledWith(
                'apps/progress',
                {
                    device: mockDevice,
                    operation: 'install',
                    selectedApps: ['ollama', 'docker']
                }
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Retrying app selection',
                { deviceId: 'device-1' }
            );
        });

        it('should handle retry-failed when device not found', async () => {
            mockDeviceService.getDevice.mockResolvedValue(undefined);

            const message: Message = {
                type: 'retry-failed',
                deviceId: 'non-existent',
                operation: 'install',
                failedApps: ['ollama']
            };

            await view.handleMessage(message);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for inference instructions',
                { deviceId: 'non-existent' }
            );
        });

        it('should handle cancel message', async () => {
            const message: Message = {
                type: 'cancel'
            };

            await view.handleMessage(message);

            expect(view['navigateTo']).toHaveBeenCalledWith('devices/manager');
            expect(mockLogger.debug).toHaveBeenCalledWith('Cancel/close request from complete view');
        });

        it('should handle unknown message types', async () => {
            const message: Message = {
                type: 'unknown-type' as any
            };

            await view.handleMessage(message);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Unhandled message in complete view',
                { type: 'unknown-type' }
            );
        });

        it('should log trace for all messages', async () => {
            const message: Message = {
                type: 'cancel'
            };

            await view.handleMessage(message);

            expect(mockLogger.trace).toHaveBeenCalledWith(
                'App complete view handling message',
                { type: 'cancel' }
            );
        });
    });
});
