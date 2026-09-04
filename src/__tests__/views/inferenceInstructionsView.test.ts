/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { InferenceInstructionsViewController } from '../../views/instructions/inference/inferenceInstructionsViewController';
import { FineTuningInstructionsViewController } from '../../views/instructions/finetuning/fineTuningInstructionsViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { Device } from '../../types/devices';
import { jest } from '@jest/globals';

jest.mock('../../constants/apps', () => {
    const actual = jest.requireActual('../../constants/apps') as any;
    return {
        ...actual,
        getAppById: jest.fn(actual.getAppById)
    };
});

describe('InferenceInstructionsViewController', () => {
    const mockLogger: Logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLevel: jest.fn(),
        getLevel: jest.fn(),
        show: jest.fn()
    } as any;

    const mockTelemetry: ITelemetryService = {
        trackEvent: jest.fn(),
        trackError: jest.fn(),
        flush: jest.fn(),
        isEnabled: jest.fn().mockReturnValue(false),
        setEnabled: jest.fn(),
        dispose: jest.fn() as any
    } as any;

    const mockDeviceService = {
        connectToDevice: (jest.fn() as any).mockResolvedValue(undefined),
        disconnectFromDevice: jest.fn(),
        getDevice: (jest.fn() as any).mockResolvedValue(undefined),
        getAllDevices: jest.fn(),
        addDevice: jest.fn(),
        removeDevice: jest.fn(),
        updateDevice: jest.fn()
    };

    const mockAppInstallationService = {
        verifyAppInstallation: (jest.fn() as any).mockResolvedValue({ isInstalled: false })
    };

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
        createdAt: '2025-01-01T00:00:00Z'
    };

    function createController() {
        return new InferenceInstructionsViewController({
            logger: mockLogger as any,
            telemetry: mockTelemetry as any,
            deviceService: mockDeviceService as any,
            appInstallationService: mockAppInstallationService as any
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('viewId', () => {
        test('returns correct view ID', () => {
            expect(InferenceInstructionsViewController.viewId()).toBe('instructions/inference');
        });
    });

    describe('render', () => {
        test('renders without device and tracks telemetry', async () => {
            const controller = createController();
            const html = await controller.render();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering inference instructions view',
                {
                    hasDevice: false,
                    templateId: undefined
                }
            );

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'instructions.inference'
                }
            });

            expect(html).toBeTruthy();
            expect(html).toContain('Ollama');
        });

        test('renders with a device and shows device-specific content', async () => {
            const controller = createController();
            const html = await controller.render({ device: mockDevice });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering inference instructions view',
                {
                    hasDevice: true,
                    templateId: undefined
                }
            );

            expect(html).toContain(mockDevice.name);
            expect(html).not.toContain('<p class="install-note">');
        });

        test('renders with templateId parameter', async () => {
            const controller = createController();
            const html = await controller.render({ templateId: 'inference' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering inference instructions view',
                {
                    hasDevice: false,
                    templateId: 'inference'
                }
            );

            expect(html).toBeTruthy();
        });

        test('includes nonce in rendered HTML when provided', async () => {
            const controller = createController();
            const nonce = 'test-nonce-12345';
            const html = await controller.render({}, nonce);

            expect(html).toContain(nonce);
        });

        test('includes all inference instruction steps', async () => {
            const controller = createController();
            const html = await controller.render();

            expect(html).toContain('ollama pull llama3.1:8b');
            expect(html).toContain('ollama run llama3.1:8b');
        });
    });

    describe('handleMessage - connect-device', () => {
        test('connects to device on connect-device message', async () => {
            const controller = createController();
            mockDeviceService.connectToDevice.mockResolvedValue(undefined);

            await controller.handleMessage({ type: 'connect-device', id: 'device-1', newWindow: true });

            expect(mockDeviceService.connectToDevice).toHaveBeenCalledWith('device-1', true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Connecting to device from inference instructions',
                { deviceId: 'device-1' }
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Successfully initiated connection to device',
                { deviceId: 'device-1' }
            );
        });

        test('logs an error when connecting to device fails', async () => {
            const controller = createController();
            const error = new Error('connection failed');
            mockDeviceService.connectToDevice.mockRejectedValue(error);

            await controller.handleMessage({ type: 'connect-device', id: 'device-1' });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to connect to device',
                { error, deviceId: 'device-1' }
            );
        });
    });

    describe('handleMessage - check-zgx-python-env', () => {
        test('sends installed status back to the webview when device and app exist', async () => {
            const controller = createController();
            const mockMessageCallback = jest.fn();
            controller.setMessageCallback(mockMessageCallback);

            mockDeviceService.getDevice.mockResolvedValue(mockDevice);
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue({ isInstalled: true });

            await controller.handleMessage({ type: 'check-zgx-python-env', deviceId: 'device-1' });

            expect(mockAppInstallationService.verifyAppInstallation).toHaveBeenCalledWith(
                mockDevice,
                expect.objectContaining({ id: 'zgx-python-env' })
            );
            expect(mockMessageCallback).toHaveBeenCalledWith({
                type: 'zgx-python-env-status',
                deviceId: 'device-1',
                isInstalled: true
            });
        });

        test('sends not-installed status when verification returns false', async () => {
            const controller = createController();
            const mockMessageCallback = jest.fn();
            controller.setMessageCallback(mockMessageCallback);

            mockDeviceService.getDevice.mockResolvedValue(mockDevice);
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue({ isInstalled: false });

            await controller.handleMessage({ type: 'check-zgx-python-env', deviceId: 'device-1' });

            expect(mockMessageCallback).toHaveBeenCalledWith({
                type: 'zgx-python-env-status',
                deviceId: 'device-1',
                isInstalled: false
            });
        });

        test('logs an error and returns when device is not found', async () => {
            const controller = createController();
            mockDeviceService.getDevice.mockResolvedValue(undefined);

            await controller.handleMessage({ type: 'check-zgx-python-env', deviceId: 'missing-device' });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Device not found for zgx-python-env check',
                { deviceId: 'missing-device' }
            );
            expect(mockAppInstallationService.verifyAppInstallation).not.toHaveBeenCalled();
        });

        test('logs an error and returns when zgx-python-env app definition is missing', async () => {
            const { getAppById } = require('../../constants/apps');
            (getAppById as jest.Mock).mockReturnValueOnce(undefined);

            const controller = createController();
            mockDeviceService.getDevice.mockResolvedValue(mockDevice);

            await controller.handleMessage({ type: 'check-zgx-python-env', deviceId: 'device-1' });

            expect(mockLogger.error).toHaveBeenCalledWith('zgx-python-env app definition not found');
            expect(mockAppInstallationService.verifyAppInstallation).not.toHaveBeenCalled();
        });
    });

    describe('handleMessage - continue-to-finetuning', () => {
        test('navigates to the fine-tuning instructions view with the resolved device', async () => {
            const controller = createController();
            const mockNavigationCallback = jest.fn() as any;
            controller.setNavigationCallback(mockNavigationCallback);

            mockDeviceService.getDevice.mockResolvedValue(mockDevice);

            await controller.handleMessage({ type: 'continue-to-finetuning', deviceId: 'device-1' });

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Continuing to finetuning instructions',
                { deviceId: 'device-1' }
            );
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                FineTuningInstructionsViewController.viewId(),
                { device: mockDevice },
                undefined
            );
        });
    });

    describe('handleMessage - other message types', () => {
        test('delegates unhandled message types to base class without throwing', async () => {
            const controller = createController();

            await expect(controller.handleMessage({ type: 'refresh' })).resolves.not.toThrow();
            expect(mockDeviceService.connectToDevice).not.toHaveBeenCalled();
            expect(mockDeviceService.getDevice).not.toHaveBeenCalled();
        });
    });

    describe('templates', () => {
        test('loads HTML template', () => {
            const controller = createController();
            expect((controller as any).template).toBeTruthy();
            expect(typeof (controller as any).template).toBe('string');
        });

        test('loads CSS styles', () => {
            const controller = createController();
            expect((controller as any).styles).toBeTruthy();
            expect(typeof (controller as any).styles).toBe('string');
        });

        test('loads client script', () => {
            const controller = createController();
            expect((controller as any).clientScript).toBeTruthy();
            expect(typeof (controller as any).clientScript).toBe('string');
        });
    });
});
