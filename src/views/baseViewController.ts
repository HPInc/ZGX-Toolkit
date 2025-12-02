/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { readFileSync } from 'fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { Logger } from '../utils/logger';
import { ITelemetryService } from '../types/telemetry';
import { Message } from '../types/messages';

/**
 * Interface that all views must implement
 */
export interface IView {
    /**
     * Render the view with optional parameters
     * @param params Optional parameters for rendering
     * @param nonce Optional nonce for CSP compliance
     * @returns HTML string to display
     */
    render(params?: any, nonce?: string): Promise<string>;

    /**
     * Handle a message from the webview
     * @param message The message to handle
     */
    handleMessage(message: Message): Promise<void>;

    /**
     * Set the callback for sending messages to the webview
     * @param callback Function to call when sending messages
     */
    setMessageCallback(callback: (message: any) => void): void;

    /**
     * Set the callback for navigation requests from views
     * @param callback Function to call when navigation is requested
     */
    setNavigationCallback(callback: (viewId: string, params?: any, panel?: 'sidebar' | 'editor') => Promise<void>): void;

    /**
     * Set the callback for refreshing the webview HTML
     * @param callback Function to call when the view needs to update its HTML
     */
    setRefreshCallback(callback: (params: any) => void): void;

    /**
     * Clean up resources when the view is disposed
     */
    dispose(): void;
}

/**
 * Base class for all views providing common functionality
 */
export abstract class BaseViewController implements IView {
    protected template: string = '';
    protected styles: string = '';
    protected clientScript: string = '';
    private static handlebarsInitialized = false;
    private static commonCss: string = '';
    private messageCallback?: (message: any) => void;
    private navigationCallback?: (viewId: string, params?: any, panel?: 'sidebar' | 'editor') => Promise<void>;
    private refreshCallback?: (params: any) => void;

    public static viewId(): string {
        throw new Error('Subclasses must implement static viewId() method');
    }

    constructor(
        protected logger: Logger,
        protected telemetry: ITelemetryService
    ) {
        // Initialize Handlebars helpers once
        if (!BaseViewController.handlebarsInitialized) {
            this.registerHandlebarsHelpers();
            BaseViewController.handlebarsInitialized = true;
        }

        // Load common.css once for all views
        if (!BaseViewController.commonCss) {
            BaseViewController.commonCss = this.loadTemplate('./common/common.css', __dirname);
        }
    }

    /**
     * Set the callback for sending messages to the webview.
     * This is called by the provider when it wants to receive async messages from the view.
     */
    public setMessageCallback(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    /**
     * Set the callback for navigation requests from views.
     * This allows views to trigger navigation programmatically.
     */
    public setNavigationCallback(callback: (viewId: string, params?: any, panel?: 'sidebar' | 'editor') => Promise<void>): void {
        this.navigationCallback = callback;
    }

    /**
     * Set the callback for refreshing the webview HTML.
     * This is called by the provider to enable views to update their content.
     */
    public setRefreshCallback(callback: (params: any) => void): void {
        this.refreshCallback = callback;
    }

    /**
     * Request navigation to another view.
     * This is called by views when they need to navigate programmatically.
     */
    protected async navigateTo(viewId: string, params?: any, panel?: 'sidebar' | 'editor'): Promise<void> {
        if (this.navigationCallback) {
            await this.navigationCallback(viewId, params, panel);
        } else {
            this.logger.warn('Cannot navigate: no navigation callback set', {
                view: this.constructor.name,
                targetView: viewId
            });
        }
    }

    /**
     * Refresh the webview content by re-rendering with optional params.
     * This method can be called by subclasses or when responding to store updates.
     * The implementation re-renders the view and updates the webview HTML through the provider callback.
     * 
     * @param params Optional parameters to pass to the render method
     */
    protected async refresh(params?: any): Promise<void> {
        if (!this.refreshCallback) {
            this.logger.warn('Cannot refresh: no refresh callback set', {
                view: this.constructor.name
            });
            return;
        }

        try {
            this.logger.trace('Refreshing view', { view: this.constructor.name, params });
            this.refreshCallback(params);
        } catch (error) {
            this.logger.error('Failed to refresh view', {
                view: this.constructor.name,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Send a message to the webview through the provider.
     * Views can use this to send async updates (like discovery results).
     */
    protected sendMessageToWebview(message: any): void {
        if (this.messageCallback) {
            this.messageCallback(message);
        } else {
            this.logger.warn('Cannot send message to webview: no callback set', {
                view: this.constructor.name,
                messageType: message.type
            });
        }
    }

    /**
     * Render the view (must be implemented by subclasses)
     */
    abstract render(params?: any, nonce?: string): Promise<string>;

    /**
     * Handle messages from the webview
     * Subclasses should override this and call super.handleMessage()
     */
    async handleMessage(message: Message): Promise<void> {
        this.logger.trace('Message received', {
            view: this.constructor.name,
            type: message.type
        });
    }

    /**
     * Clean up resources
     * Subclasses should override this and call super.dispose() if needed
     */
    dispose(): void {
        this.logger.debug('View disposed', { view: this.constructor.name });
    }

    /**
     * Load a template file from the filesystem
     * @param relativePath Path relative to the view file
     * @param callerDir The __dirname of the calling file (must be passed from subclass)
     */
    protected loadTemplate(relativePath: string, callerDir?: string): string {
        try {
            // Use callerDir if provided, otherwise use __dirname
            let baseDir = callerDir ?? __dirname;
            
            const fullPath = path.resolve(baseDir, relativePath);
            
            return readFileSync(fullPath, 'utf8');
        } catch (error) {
            this.logger.error('Failed to load template', { relativePath, callerDir, error });
            return '';
        }
    }

    /**
     * Register custom Handlebars helpers
     */
    private registerHandlebarsHelpers(): void {
        // Register helper for conditional rendering (for compatibility with existing templates)
        // This is already built into Handlebars, but we can add custom helpers if needed
        
        // Custom helper to check if a value is falsy (for templates that use isNotSetup pattern)
        Handlebars.registerHelper('not', function(value) {
            return !value;
        });

        // Helper for equality check
        Handlebars.registerHelper('eq', function(a, b) {
            return a === b;
        });

        // Helper for inequality check
        Handlebars.registerHelper('neq', function(a, b) {
            return a !== b;
        });
    }

    /**
     * Render a template with data using Handlebars
     * 
     * @param template The template string
     * @param data The data to render
     */
    protected renderTemplate(template: string, data: any): string {
        const startTime = Date.now();
        
        try {
            // Compile the template
            const compiledTemplate = Handlebars.compile(template, {
                noEscape: false, // Enable HTML escaping for security
                strict: false,   // Allow accessing undefined properties without errors
            });
            
            // Render with data
            const result = compiledTemplate(data);
            
            const duration = Date.now() - startTime;
            if (duration > 50) {
                this.logger.warn('Slow template rendering detected', { 
                    view: this.constructor.name,
                    duration 
                });
            }
            
            return result;
        } catch (error) {
            this.logger.error('Template rendering failed', {
                view: this.constructor.name,
                error: error instanceof Error ? error.message : String(error)
            });
            return '';
        }
    }

    /**
     * Wrap HTML content with styles
     * @param html The HTML content
     * @param nonce Optional nonce for CSP compliance
     */
    protected wrapWithStyles(html: string, nonce?: string): string {
        // Automatically prepend common.css to all child view styles
        const allStyles = BaseViewController.commonCss + (this.styles ? '\n' + this.styles : '');
        if (!allStyles) {
            return html;
        }
        const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
        const styles = `<style${nonceAttr}>${allStyles}</style>`;
        return `${styles}${html}`;
    }

    /**
     * Wrap HTML content with client-side script
     * @param html The HTML content (already includes styles)
     * @param nonce Optional nonce for CSP compliance
     */
    protected wrapWithScript(html: string, nonce?: string): string {
        if (!this.clientScript) {
            return html;
        }
        const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
        const script = `<script${nonceAttr}>${this.clientScript}</script>`;
        return `${html}${script}`;
    }

    /**
     * Perform full HTML wrapping with styles and script
     * @param html The raw HTML content
     * @param nonce Optional nonce for CSP compliance
     */
    protected wrapHtml(html: string, nonce?: string): string {
        return this.wrapWithScript(this.wrapWithStyles(html, nonce), nonce);
    }
}
