/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { RagInstructionsViewController } from '../../views/instructions/rag/ragInstructionsViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { DeviceService } from '../../services';
import { jest } from '@jest/globals';

describe('RagInstructionsViewController', () => {
    // Mock logger
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

    // Mock telemetry
    const mockTelemetry: ITelemetryService = {
        trackEvent: jest.fn(),
        trackError: jest.fn(),
        flush: jest.fn(),
        isEnabled: jest.fn().mockReturnValue(false),
        setEnabled: jest.fn(),
        dispose: jest.fn() as any
    } as any;

    // Mock device service
    const mockDeviceService = {
        connectToDevice: jest.fn(),
        disconnectFromDevice: jest.fn(),
        getDeviceById: jest.fn(),
        getAllDevices: jest.fn(),
        addDevice: jest.fn(),
        removeDevice: jest.fn(),
        updateDevice: jest.fn()
    } as any as DeviceService;

    function createController() {
        return new RagInstructionsViewController({
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
            expect(RagInstructionsViewController.viewId()).toBe('instructions/rag');
        });
    });

    describe('render', () => {
        test('renders without device and tracks telemetry', async () => {
            const controller = createController();
            const html = await controller.render();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering RAG instructions view',
                {
                    hasDevice: false,
                    templateId: undefined
                }
            );

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'instructions.rag',
                }
            });

            expect(html).toBeTruthy();
            expect(html).toContain('Build your first RAG application');
        });

        test('renders with templateId parameter', async () => {
            const controller = createController();
            const html = await controller.render({ templateId: 'rag' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Rendering RAG instructions view',
                {
                    hasDevice: false,
                    templateId: 'rag'
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

        test('includes all RAG instruction steps', async () => {
            const controller = createController();
            const html = await controller.render();

            // Check for key instruction steps
            expect(html).toContain('mkdir rag_quickstart');
            expect(html).toContain('streamlit run rag.py');
        });
    });

    describe('handleMessage', () => {
        test('delegates all messages to base class', async () => {
            const controller = createController();
            const message = {
                type: 'navigate' as const,
                targetView: 'devices/manager'
            };

            await expect(controller.handleMessage(message)).resolves.not.toThrow();
        });

        test('handles refresh message', async () => {
            const controller = createController();
            const message = {
                type: 'refresh' as const
            };

            await expect(controller.handleMessage(message)).resolves.not.toThrow();
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
