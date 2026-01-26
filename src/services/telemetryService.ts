/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Telemetry service for the ZGX Toolkit extension.
 * 
 * This service provides a clean interface for tracking usage, performance,
 * and errors throughout the extension.
 */

import { ITelemetryService } from '../types/telemetry';
import { logger } from '../utils/logger';
import { APP_INSIGHTS_CONNS } from '../constants/appInsights';
import { TelemetryReporter, ReplacementOption } from '@vscode/extension-telemetry';
import { TelemetryLoggerOptions } from 'vscode';
import * as telemetry from '../types/telemetry';

/**
 * Telemetry service implementation.
 * Tracks extension usage.
 */
class TelemetryService implements ITelemetryService {
    private enabled: boolean = false;
    private reporter: TelemetryReporter | null = null;

    constructor() {
        // Default to production connection string.
        let connectionString: string = APP_INSIGHTS_CONNS.PROD;

        // Override connection string based on ZTK_TELEMETRY environment variable.
        const telemetryEnv = process.env.ZTK_TELEMETRY;
        if (telemetryEnv) {
            const env = telemetryEnv.toLowerCase();
            
            if (env === 'dev') {
                connectionString = APP_INSIGHTS_CONNS.DEV;
            } else if (env === 'qa') {
                connectionString = APP_INSIGHTS_CONNS.QA;
            } else if (env === 'hper') {
                connectionString = APP_INSIGHTS_CONNS.HPER;
            } else if (env === 'prod') {
                connectionString = APP_INSIGHTS_CONNS.PROD;
            }
        }

        try {
            // Setup our reporter
            let topts: TelemetryLoggerOptions = {
                ignoreBuiltInCommonProperties: true,
            };
            let ropts: ReplacementOption[] = [];
            
            this.reporter = new TelemetryReporter(connectionString, ropts, topts);
        } catch (error) {
            this.reporter = null;
            logger.error('Failed to initialize TelemetryReporter', { error });
        }
        
    }

    /**
     * Track a telemetry event.
     * 
     * @param event Telemetry event to track
     */
    public trackEvent(event: telemetry.AnyTelemetryEvent): void {
        logger.trace('Telemetry: trackEvent', { event });
        if (this.enabled && this.reporter) {
            const eventStr = `${event.eventType}.${event.action}`;
            this.reporter.sendTelemetryEvent(eventStr, event.properties ?? undefined, event.measurements ?? undefined);
        }
    }

    /**
     * Track an error event.
     * 
     * @param event Error event to track
     */
    public trackError(event: telemetry.AnyTelemetryErrorEvent): void {
        logger.trace('Telemetry: trackError', { error: event.error });
        if (this.enabled && this.reporter) {
            this.reporter.sendTelemetryErrorEvent(
                event.eventType,
                {
                    errorMsg: event.error.message,
                    context: event.context ?? '',
                },
            );
        }
    }

    /**
     * Check if telemetry is enabled.
     * 
     * @returns Whether telemetry is currently enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Set whether telemetry is enabled.
     * 
     * @param enabled Whether to enable telemetry
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        logger.debug('Telemetry enabled state changed', { enabled });
    }

    /**
     * Dispose the telemetry service.
     * 
     * @remarks
     * Disposes the underlying telemetry reporter. After disposal, the service
     * should not be used.
     */
    public async dispose(): Promise<void> {
        if (this.reporter) {
            await this.reporter.dispose();
            this.reporter = null;
        }
    }
}

/**
 * Singleton telemetry service instance.
 * 
 * Usage throughout the codebase:
 * ```typescript
 * import { telemetryService } from './services/telemetryService';
 * 
 * telemetryService.trackEvent({
 *   eventType: TelemetryEventType.Command,
 *   action: 'execute',
 *   properties: { commandId: 'zgxToolkit.setLogLevel' }
 * });
 * 
 * telemetryService.trackEvent({
 *   eventType: TelemetryEventType.Device,
 *   action: 'create',
 *   properties: { deviceType: 'zgx' }
 * });
 * 
 * telemetryService.trackError({ eventType: TelemetryEventType.Error, error: error, context: 'ssh-connection' });
 * ```
 * 
 * @remarks
 * Integration with VS Code's telemetry API and Azure Application Insights.
 * Ensures GDPR compliance and user consent.
 */
export const telemetryService: ITelemetryService = new TelemetryService();

/**
 * Export the TelemetryService class for testing purposes.
 */
export { TelemetryService };
