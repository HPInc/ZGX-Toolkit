/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { LoadingViewController } from '../../views/common/loading/loadingViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';

describe('LoadingViewController', () => {
    let view: LoadingViewController;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn()
        } as any;

        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        } as any;

        view = new LoadingViewController({ logger: mockLogger, telemetry: mockTelemetry });
    });

    afterEach(() => {
        view.dispose();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(LoadingViewController.viewId()).toBe('common/loading');
        });
    });

    describe('render', () => {
        it('should render the default message when no params are provided', async () => {
            const html = await view.render();

            expect(html).toContain('Loading...');
            expect(mockLogger.debug).toHaveBeenCalledWith('Rendering loading view', undefined);
        });

        it('should render a custom message', async () => {
            const html = await view.render({ message: 'Connecting to device...' });

            expect(html).toContain('Connecting to device...');
        });

        it('should pass a nonce through to the wrapped html', async () => {
            const html = await view.render({ message: 'Working...' }, 'test-nonce');

            expect(html).toContain('test-nonce');
        });
    });

    describe('handleMessage', () => {
        it('should not throw when receiving a message (base handling only)', async () => {
            await expect(view.handleMessage({ type: 'refresh' })).resolves.toBeUndefined();
        });
    });

    describe('dispose', () => {
        it('should not throw', () => {
            expect(() => view.dispose()).not.toThrow();
        });
    });
});
