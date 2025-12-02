/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService } from '../../../types/telemetry';
import { Message } from '../../../types/messages';

/**
 * Error view for displaying error messages
 */
export class ErrorViewController extends BaseViewController {

    public static viewId(): string {
        return "common/error";
    }

    constructor(deps: { logger: Logger; telemetry: ITelemetryService }) {
        super(deps.logger, deps.telemetry);
        this.template = this.loadTemplate('./error.html', __dirname);
        this.styles = this.loadTemplate('./error.css', __dirname);
        this.clientScript = this.loadTemplate('./error.js', __dirname);
    }

    async render(params?: { message: string; canRetry?: boolean; canGoBack?: boolean }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering error view', params);

        const html = this.renderTemplate(this.template, {
            message: params?.message || 'An error occurred',
            canRetry: params?.canRetry || false,
            canGoBack: params?.canGoBack || false
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        switch (message.type) {
            case 'retry':
                this.logger.info('Error view: Retry requested');
                // The provider should handle this by re-rendering the previous view
                break;
            case 'navigate-back':
                this.logger.info('Error view: Navigate back requested');
                // The provider should handle this by navigating to the previous view
                break;
        }
    }
}
