/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { IView } from './baseViewController';
import { Logger } from '../utils/logger';
import { ITelemetryService } from '../types/telemetry';

// Import view classes
import { DeviceListViewController } from './devices/list/deviceListViewController';
import { DeviceManagerViewController } from './devices/manager/deviceManagerViewController';
import { ErrorViewController } from './common/error/errorViewController';
import { LoadingViewController } from './common/loading/loadingViewController';
import { SetupOptionsViewController } from './setup/options/setupOptionsViewController';
import { AutomaticSetupViewController } from './setup/automatic/automaticSetupViewController';
import { ManualSetupViewController } from './setup/manual/manualSetupViewController';
import { DnsRegistrationViewController } from './setup/dnsRegistration/dnsRegistrationViewController';
import { SetupSuccessViewController } from './setup/success/setupSuccessViewController';
import { AppSelectionViewController } from './apps/selection/appSelectionViewController';
import { AppProgressViewController } from './apps/progress/appProgressViewController';
import { AppCompleteViewController } from './apps/complete/appCompleteViewController';
import { InferenceInstructionsViewController } from './instructions/inference/inferenceInstructionsViewController';
import { FineTuningInstructionsViewController } from './instructions/finetuning/fineTuningInstructionsViewController';
import { RagInstructionsViewController } from './instructions/rag/ragInstructionsViewController';
import { TemplateListViewController } from './templates/templateListViewController';

/**
 * Type for view constructor functions
 */
type ViewConstructor = new (...args: any[]) => IView;

/**
 * Factory for creating view instances with dependency injection.
 * Views are registered with a unique identifier and can be instantiated on demand.
 */
export class ViewFactory {
    private registry = new Map<string, ViewConstructor>();

    constructor(
        private logger: Logger,
        private telemetry: ITelemetryService,
        private dependencies: Record<string, any> = {}
    ) {
        this.registerViews();
    }

    /**
     * Register all available views
     * This method should be updated as new views are added
     */
    private registerViews(): void {
        // Common views
        this.register(ErrorViewController.viewId(), ErrorViewController);
        this.register(LoadingViewController.viewId(), LoadingViewController);

        // Device views
        this.register(DeviceListViewController.viewId(), DeviceListViewController);
        this.register(DeviceManagerViewController.viewId(), DeviceManagerViewController);

        // Setup views
        this.register(SetupOptionsViewController.viewId(), SetupOptionsViewController);
        this.register(AutomaticSetupViewController.viewId(), AutomaticSetupViewController);
        this.register(ManualSetupViewController.viewId(), ManualSetupViewController);
        this.register(DnsRegistrationViewController.viewId(), DnsRegistrationViewController);
        this.register(SetupSuccessViewController.viewId(), SetupSuccessViewController);

        // App views
        this.register(AppSelectionViewController.viewId(), AppSelectionViewController);
        this.register(AppProgressViewController.viewId(), AppProgressViewController);
        this.register(AppCompleteViewController.viewId(), AppCompleteViewController);
        
        // Instruction views
        this.register(InferenceInstructionsViewController.viewId(), InferenceInstructionsViewController);
        this.register(FineTuningInstructionsViewController.viewId(), FineTuningInstructionsViewController);
        this.register(RagInstructionsViewController.viewId(), RagInstructionsViewController);

        // Template views
        this.register(TemplateListViewController.viewId(), TemplateListViewController);
        this.logger.debug('View registry initialized', { 
            viewCount: this.registry.size 
        });
    }

    /**
     * Register a view with the factory
     * @param viewId Unique identifier for the view
     * @param viewClass The view class constructor
     */
    register(viewId: string, viewClass: ViewConstructor): void {
        if (this.registry.has(viewId)) {
            this.logger.warn('View already registered, overwriting', { viewId });
        }

        this.registry.set(viewId, viewClass);
        this.logger.debug('View registered', { viewId });
    }

    /**
     * Create a view instance
     * @param viewId The view identifier
     * @param additionalDeps Additional dependencies specific to this view
     * @returns The created view instance
     * @throws Error if view is not registered
     */
    create(viewId: string, additionalDeps: Record<string, any> = {}): IView {
        const ViewClass = this.registry.get(viewId);

        if (!ViewClass) {
            const error = `View not registered: ${viewId}`;
            this.logger.error(error);
            throw new Error(error);
        }

        this.logger.debug('Creating view', { viewId });

        try {
            // Merge dependencies
            const allDeps = {
                ...this.dependencies,
                ...additionalDeps,
                logger: this.logger,
                telemetry: this.telemetry
            };

            // Create the view with dependencies
            const view = new ViewClass(allDeps);
            
            this.logger.debug('View created successfully', { viewId });
            return view;
        } catch (error) {
            this.logger.error('Failed to create view', {
                viewId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Check if a view is registered
     * @param viewId The view identifier
     * @returns True if the view is registered
     */
    has(viewId: string): boolean {
        return this.registry.has(viewId);
    }

    /**
     * Get all registered view identifiers
     * @returns Array of view identifiers
     */
    getRegisteredViews(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Unregister a view
     * @param viewId The view identifier
     * @returns True if the view was unregistered
     */
    unregister(viewId: string): boolean {
        const result = this.registry.delete(viewId);
        if (result) {
            this.logger.debug('View unregistered', { viewId });
        }
        return result;
    }

    /**
     * Clear all registered views
     */
    clear(): void {
        this.registry.clear();
        this.logger.debug('View registry cleared');
    }
}
