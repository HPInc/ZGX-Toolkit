/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService } from '../../../types/telemetry';

/**
 * Loading view for displaying loading states
 */
export class LoadingViewController extends BaseViewController {

    public static viewId(): string {
        return 'common/loading';
    }

    constructor(deps: { logger: Logger; telemetry: ITelemetryService }) {
        super(deps.logger, deps.telemetry);
        this.template = this.loadTemplate('./loading.html', __dirname);
        this.styles = this.loadTemplate('./loading.css', __dirname);
        // No client script needed for loading view
    }

    async render(params?: { message?: string }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering loading view', params);

        const html = this.renderTemplate(this.template, {
            message: params?.message || 'Loading...'
        });

        return this.wrapHtml(html, nonce);
    }
}
