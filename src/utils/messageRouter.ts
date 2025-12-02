/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Logger } from './logger';
import { IView } from '../views/baseViewController';
import { Message } from '../types/messages';

/**
 * Routes messages from the webview to the current view.
 * Handles errors and logging for message routing.
 */
export class MessageRouter {
    constructor(private logger: Logger) {}

    /**
     * Route a message to the current view
     * @param message The message to route
     * @param currentView The current view to receive the message
     */
    async routeMessage(message: Message, currentView: IView | null): Promise<void> {
        this.logger.trace('Routing message', { type: message.type });

        if (!currentView) {
            this.logger.warn('No view to handle message', { type: message.type });
            return;
        }

        try {
            await currentView.handleMessage(message);
            this.logger.trace('Message handled successfully', { type: message.type });
        } catch (error) {
            this.logger.error('Error handling message', {
                error: error instanceof Error ? error.message : String(error),
                type: message.type,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Validate that a message has the required structure
     * @param message The message to validate
     * @returns True if the message is valid
     */
    validateMessage(message: any): message is Message {
        if (!message || typeof message !== 'object') {
            this.logger.warn('Invalid message: not an object', { message });
            return false;
        }

        if (!message.type || typeof message.type !== 'string') {
            this.logger.warn('Invalid message: missing or invalid type', { message });
            return false;
        }

        return true;
    }
}
