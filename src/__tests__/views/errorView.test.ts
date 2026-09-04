/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ErrorViewController } from '../../views/common/error/errorViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Message } from '../../types/messages';

describe('ErrorViewController', () => {
    let view: ErrorViewController;
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

        view = new ErrorViewController({ logger: mockLogger, telemetry: mockTelemetry });
    });

    afterEach(() => {
        view.dispose();
    });

    describe('viewId', () => {
        it('should return correct view id', () => {
            expect(ErrorViewController.viewId()).toBe('common/error');
        });
    });

    describe('render', () => {
        it('should render the default message when no params are provided', async () => {
            const html = await view.render();

            expect(html).toContain('An error occurred');
            expect(mockLogger.debug).toHaveBeenCalledWith('Rendering error view', undefined);
        });

        it('should render a custom message', async () => {
            const html = await view.render({ message: 'Something went wrong' });

            expect(html).toContain('Something went wrong');
        });

        it('should render the retry button when canRetry is true', async () => {
            const html = await view.render({ message: 'oops', canRetry: true });

            expect(html).toContain('id="retry-btn"');
        });

        it('should not render the retry button when canRetry is false', async () => {
            const html = await view.render({ message: 'oops', canRetry: false });

            expect(html).not.toContain('id="retry-btn"');
        });

        it('should render the back button when canGoBack is true', async () => {
            const html = await view.render({ message: 'oops', canGoBack: true });

            expect(html).toContain('id="back-btn"');
        });

        it('should not render the back button when canGoBack is false', async () => {
            const html = await view.render({ message: 'oops', canGoBack: false });

            expect(html).not.toContain('id="back-btn"');
        });

        it('should pass a nonce through to the wrapped html', async () => {
            const html = await view.render({ message: 'oops' }, 'test-nonce');

            expect(html).toContain('test-nonce');
        });
    });

    describe('handleMessage', () => {
        it('should log a retry request', async () => {
            const message: Message = { type: 'retry' };

            await view.handleMessage(message);

            expect(mockLogger.info).toHaveBeenCalledWith('Error view: Retry requested');
        });

        it('should log a navigate-back request', async () => {
            const message: Message = { type: 'navigate-back' };

            await view.handleMessage(message);

            expect(mockLogger.info).toHaveBeenCalledWith('Error view: Navigate back requested');
        });

        it('should do nothing extra for unrelated message types', async () => {
            const message: Message = { type: 'refresh' };

            await view.handleMessage(message);

            expect(mockLogger.info).not.toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should not throw', () => {
            expect(() => view.dispose()).not.toThrow();
        });
    });
});
