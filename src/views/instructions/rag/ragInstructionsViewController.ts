/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { Device } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { DeviceService } from '../../../services';

/**
 * View for displaying RAG application instructions.
 * Provides step-by-step guide for building RAG applications.
 */
export class RagInstructionsViewController extends BaseViewController {
    public static viewId(): string {
        return 'instructions/rag';
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            deviceService: DeviceService;
        }
    ) {
        super(deps.logger, deps.telemetry);

        this.template = this.loadTemplate('instructions/rag/ragInstructions.html');
        this.styles = this.loadTemplate('instructions/rag/ragInstructions.css');
        this.clientScript = this.loadTemplate('instructions/rag/ragInstructions.js');
    }

    /**
     * Render the RAG instructions view.
     */
    async render(params?: { device?: Device; templateId?: string }, nonce?: string): Promise<string> {
        const device = params?.device;

        this.logger.debug('Rendering RAG instructions view', {
            hasDevice: !!device,
            templateId: params?.templateId
        });

        const html = this.renderTemplate(this.template, {
            deviceId: device?.id,
            deviceName: device?.name
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'instructions.rag'
            }
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Handle messages from the webview.
     */
    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);
    }
}
