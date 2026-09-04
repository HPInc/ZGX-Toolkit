/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { FineTuningInstructionsViewController } from '../../views/instructions/finetuning/fineTuningInstructionsViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { Device } from '../../types/devices';
import { jest } from '@jest/globals';

describe('FineTuningInstructionsViewController', () => {
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
        getDevice: jest.fn(),
        getAllDevices: jest.fn(),
        addDevice: jest.fn(),
        removeDevice: jest.fn(),
        updateDevice: jest.fn()
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
        return new FineTuningInstructionsViewController({
            logger: mockLogger as any,
            telemetry: mockTelemetry as any,
            deviceService: mockDeviceService as any
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('viewId', () => {
        test('returns correct view ID', () => {
            expect(FineTuningInstructionsViewController.viewId()).toBe('instructions/finetuning');
        });
    });

    describe('render', () => {
        test('renders without device and tracks telemetry', async () => {
            const controller = createController();
            const html = await controller.render();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering fine-tuning instructions view',
                {
                    hasDevice: false,
                    templateId: undefined
                }
            );

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'instructions.finetuning'
                }
            });

            expect(html).toBeTruthy();
            expect(html).toContain('ZGX Python Environment');
        });

        test('renders with a device and shows device-specific content', async () => {
            const controller = createController();
            const html = await controller.render({ device: mockDevice });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering fine-tuning instructions view',
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
            const html = await controller.render({ templateId: 'finetuning' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering fine-tuning instructions view',
                {
                    hasDevice: false,
                    templateId: 'finetuning'
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

        test('includes all fine-tuning instruction steps', async () => {
            const controller = createController();
            const html = await controller.render();

            expect(html).toContain('mkdir fine-tuning-qwen2_7b');
            expect(html).toContain('tune run lora_finetune_single_device');
        });
    });

    describe('handleMessage', () => {
        test('connects to device on connect-device message', async () => {
            const controller = createController();
            mockDeviceService.connectToDevice.mockResolvedValue(undefined);

            await controller.handleMessage({ type: 'connect-device', id: 'device-1', newWindow: true });

            expect(mockDeviceService.connectToDevice).toHaveBeenCalledWith('device-1', true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Connecting to device from fine-tuning instructions',
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

        test('delegates unhandled message types to base class without throwing', async () => {
            const controller = createController();

            await expect(controller.handleMessage({ type: 'refresh' })).resolves.not.toThrow();
            expect(mockDeviceService.connectToDevice).not.toHaveBeenCalled();
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
