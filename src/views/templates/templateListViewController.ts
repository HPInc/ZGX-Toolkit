/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../baseViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { InferenceInstructionsViewController } from '../instructions/inference/inferenceInstructionsViewController';
import { FineTuningInstructionsViewController } from '../instructions/finetuning/fineTuningInstructionsViewController';

export class TemplateListViewController extends BaseViewController {
    public static viewId(): string {
        return 'templates/list';
    }

    constructor(deps: { logger: Logger; telemetry: ITelemetryService }) {
        super(deps.logger, deps.telemetry);

        this.template = this.loadTemplate('./templateList.html', __dirname);
        this.styles = this.loadTemplate('./templateList.css', __dirname);
        this.clientScript = this.loadTemplate('./templateList.js', __dirname);
    }

    async render(_params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering template list view');
        const templatesAvailable = (this.template.match(/data-id="([^"]+)"/g) || []).length;

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'templates.list',
            },
            measurements: {
                templateCount: templatesAvailable,
            }
        });
        return this.wrapHtml(this.template, nonce);
    }

    async handleMessage(message: any): Promise<void> {
        await super.handleMessage(message);
        
        if (message.type !== 'template-select') {
            return;
        }

        this.logger.info('Template selected', { id: message.id });

        switch (message.id) {
            case 'inference':
                try {
                    this.telemetry.trackEvent({
                        eventType: TelemetryEventType.View,
                        action: 'navigate',
                        properties: {
                            toView: 'templates.inference',
                        }
                    });
                    await this.navigateTo(
                        InferenceInstructionsViewController.viewId(),
                        { templateId: message.id },
                        'editor'
                    );
                } catch (err) {
                    this.logger.error('Failed to navigate to inference instructions view', { error: err });
                    this.telemetry.trackError({ 
                        eventType: TelemetryEventType.Error,
                        error: err as Error,
                        context: 'templates.inference'
                    });
                }
                break;

            case 'fine-tuning':
                try {
                    this.telemetry.trackEvent({
                        eventType: TelemetryEventType.View,
                        action: 'navigate',
                        properties: {
                            toView: 'templates.fine-tuning',
                        }
                    });
                    await this.navigateTo(
                        FineTuningInstructionsViewController.viewId(),
                        { templateId: message.id },
                        'editor'
                    );
                } catch (err) {
                    this.logger.error('Failed to navigate to fine-tuning instructions view', { error: err });
                    this.telemetry.trackError({ 
                        eventType: TelemetryEventType.Error,
                        error: err as Error,
                        context: 'templates.fine-tuning'
                    });
                }
                break;
        }
    }
}
