/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { TemplateListViewController } from '../../views/templates/templateListViewController';
import { InferenceInstructionsViewController } from '../../views/instructions/inference/inferenceInstructionsViewController';
import { FineTuningInstructionsViewController } from '../../views/instructions/finetuning/fineTuningInstructionsViewController';
import { RagInstructionsViewController } from '../../views/instructions/rag/ragInstructionsViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { jest } from '@jest/globals';

describe('TemplateListViewController', () => {
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

    function createController() {
        return new TemplateListViewController({ logger: mockLogger as any, telemetry: mockTelemetry as any });
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('render() tracks navigation and returns HTML with template cards', async () => {
        const controller = createController();
        const html = await controller.render();
        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'templates.list',
            },
            measurements: {
                templateCount: expect.any(Number),
            }
        });
        
        const call = (mockTelemetry.trackEvent as jest.Mock).mock.calls.find(
            (c: any) => c[0]?.properties?.toView === 'templates.list'
        );
        expect(call).toBeDefined();
        
        const eventData = call![0] as { measurements?: { templateCount?: number } };
        expect(eventData.measurements?.templateCount).toBeGreaterThanOrEqual(1);
        expect(html).toMatch(/data-id="inference"/);
        expect(html).toMatch(/data-id="fine-tuning"/);
        expect(html).toMatch(/data-id="rag"/);
    });

    test('render() template count equals number of unique data-id attributes', async () => {
        const controller = createController();
        const html = await controller.render();
        const ids = Array.from(html.matchAll(/data-id="([^"]+)"/g)).map(m => m[1]);
        const unique = new Set(ids);
        const call = (mockTelemetry.trackEvent as jest.Mock).mock.calls.find(
            (c: any) => c[0]?.properties?.toView === 'templates.list'
        );
        expect(call).toBeDefined();

        const eventData = call![0] as { measurements?: { templateCount?: number } };
        expect(eventData.measurements?.templateCount).toBe(unique.size);
    });

    test('handleMessage navigates to inference instructions on inference selection', async () => {
        const controller = createController();
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.handleMessage({ type: 'template-select', id: 'inference' });
        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'templates.inference',
            }
        });
        expect(navigateSpy).toHaveBeenCalledWith(
            InferenceInstructionsViewController.viewId(),
            { templateId: 'inference' },
            'editor'
        );
    });

    test('handleMessage navigates to fine-tuning instructions on fine-tuning selection', async () => {
        const controller = createController();
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.handleMessage({ type: 'template-select', id: 'fine-tuning' });

        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'templates.fine-tuning',
            }
        });
        expect(navigateSpy).toHaveBeenCalledWith(
            FineTuningInstructionsViewController.viewId(),
            { templateId: 'fine-tuning' },
            'editor'
        );
    });

    test('handleMessage ignores unknown template ids', async () => {
        const controller = createController();
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.handleMessage({ type: 'template-select', id: 'unknown-template' });
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    test('handleMessage ignores non template-select messages', async () => {
        const controller = createController();
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.handleMessage({ type: 'other-message', id: 'inference' });
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    test('handleMessage logs error telemetry when navigation fails for inference', async () => {
        const controller = createController();
        const err = new Error('navigate failed');
        jest.spyOn(controller as any, 'navigateTo').mockRejectedValue(err);

        await controller.handleMessage({ type: 'template-select', id: 'inference' });
        expect(mockTelemetry.trackError).toHaveBeenCalledWith({
            eventType: TelemetryEventType.Error,
            error: err as Error,
            context: 'templates.inference'
        });
    });

    test('handleMessage logs error telemetry when navigation fails for fine-tuning', async () => {
        const controller = createController();
        const err = new Error('navigate failed');
        jest.spyOn(controller as any, 'navigateTo').mockRejectedValue(err);

        await controller.handleMessage({ type: 'template-select', id: 'fine-tuning' });
        expect(mockTelemetry.trackError).toHaveBeenCalledWith({
            eventType: TelemetryEventType.Error,
            error: err as Error,
            context: 'templates.fine-tuning'
        });
    });
    test('no telemetry feature event fired for non-selection messages', async () => {
        const controller = createController();
        await controller.handleMessage({ type: 'unrelated', foo: 'bar' });
        expect(mockTelemetry.trackEvent).not.toHaveBeenCalled();
    });

    test('handleMessage navigates to RAG instructions on rag selection', async () => {
        const controller = createController();
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.handleMessage({ type: 'template-select', id: 'rag' });

        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'templates.rag',
            }
        });
        expect(navigateSpy).toHaveBeenCalledWith(
            RagInstructionsViewController.viewId(),
            { templateId: 'rag' },
            'editor'
        );
    });

    test('handleMessage logs error telemetry when navigation fails for rag', async () => {
        const controller = createController();
        const err = new Error('navigate failed');
        jest.spyOn(controller as any, 'navigateTo').mockRejectedValue(err);

        await controller.handleMessage({ type: 'template-select', id: 'rag' });
        expect(mockTelemetry.trackError).toHaveBeenCalledWith({
            eventType: TelemetryEventType.Error,
            error: err as Error,
            context: 'templates.rag'
        });
    });
});
