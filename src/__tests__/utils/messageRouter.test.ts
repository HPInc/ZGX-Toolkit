/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the MessageRouter utility.
 */

import { MessageRouter } from '../../utils/messageRouter';
import { Logger } from '../../utils/logger';
import { IView } from '../../views/baseViewController';
import { Message } from '../../types/messages';

describe('MessageRouter', () => {
    let mockLogger: jest.Mocked<Logger>;
    let mockView: jest.Mocked<IView>;
    let router: MessageRouter;
    const message: Message = { type: 'refresh' };

    beforeEach(() => {
        mockLogger = {
            trace: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        mockView = {
            render: jest.fn(),
            handleMessage: jest.fn(),
            setMessageCallback: jest.fn(),
            setNavigationCallback: jest.fn(),
            setRefreshCallback: jest.fn(),
            dispose: jest.fn()
        } as unknown as jest.Mocked<IView>;

        router = new MessageRouter(mockLogger);
    });

    describe('routeMessage', () => {
        it('logs a warning and does not dispatch when there is no current view', async () => {
            await router.routeMessage(message, null);

            expect(mockLogger.trace).toHaveBeenCalledWith('Routing message', { type: 'refresh' });
            expect(mockLogger.warn).toHaveBeenCalledWith('No view to handle message', { type: 'refresh' });
            expect(mockView.handleMessage).not.toHaveBeenCalled();
        });

        it('dispatches the message to the current view and logs success', async () => {
            mockView.handleMessage.mockResolvedValue(undefined);

            await router.routeMessage(message, mockView);

            expect(mockView.handleMessage).toHaveBeenCalledWith(message);
            expect(mockLogger.trace).toHaveBeenCalledWith('Routing message', { type: 'refresh' });
            expect(mockLogger.trace).toHaveBeenCalledWith('Message handled successfully', { type: 'refresh' });
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it('logs and rethrows an Error thrown by the view', async () => {
            const thrown = new Error('boom');
            mockView.handleMessage.mockRejectedValue(thrown);

            await expect(router.routeMessage(message, mockView)).rejects.toThrow('boom');

            expect(mockLogger.error).toHaveBeenCalledWith('Error handling message', {
                error: 'boom',
                type: 'refresh',
                stack: thrown.stack
            });
        });

        it('logs and rethrows a non-Error value thrown by the view', async () => {
            mockView.handleMessage.mockRejectedValue('plain-string-failure');

            await expect(router.routeMessage(message, mockView)).rejects.toBe('plain-string-failure');

            expect(mockLogger.error).toHaveBeenCalledWith('Error handling message', {
                error: 'plain-string-failure',
                type: 'refresh',
                stack: undefined
            });
        });
    });

    describe('validateMessage', () => {
        it('returns false and warns when the message is null', () => {
            expect(router.validateMessage(null)).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('Invalid message: not an object', { message: null });
        });

        it('returns false and warns when the message is not an object', () => {
            expect(router.validateMessage('not-an-object')).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('Invalid message: not an object', { message: 'not-an-object' });
        });

        it('returns false and warns when the message is missing a type', () => {
            const invalid = { foo: 'bar' };
            expect(router.validateMessage(invalid)).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('Invalid message: missing or invalid type', { message: invalid });
        });

        it('returns false when the type is not a string', () => {
            const invalid = { type: 123 };
            expect(router.validateMessage(invalid)).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('Invalid message: missing or invalid type', { message: invalid });
        });

        it('returns true for a valid message', () => {
            const valid = { type: 'refresh' };
            expect(router.validateMessage(valid)).toBe(true);
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });
    });
});
