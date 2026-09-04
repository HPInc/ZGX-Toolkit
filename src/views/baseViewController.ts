/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { readFileSync } from 'node:fs';
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
    render(params?: Record<string, unknown>, nonce?: string): Promise<string>;

    /**
     * Handle a message from the webview
     * @param message The message to handle
     */
    handleMessage(message: Message): Promise<void>;

    /**
     * Set the callback for sending messages to the webview
     * @param callback Function to call when sending messages
     */
    setMessageCallback(callback: (message: Record<string, unknown>) => void): void;

    /**
     * Set the callback for navigation requests from views
     * @param callback Function to call when navigation is requested
     */
    setNavigationCallback(callback: (viewId: string, params?: Record<string, unknown>, panel?: 'sidebar' | 'editor') => Promise<void>): void;

    /**
     * Set the callback for refreshing the webview HTML
     * @param callback Function to call when the view needs to update its HTML
     */
    setRefreshCallback(callback: (params?: Record<string, unknown>) => void): void;

    /**
     * Clean up resources when the view is disposed
     */
    dispose(): void;
}

/**
 * Base class for all views providing common functionality
 */
export abstract class BaseViewController implements IView {
    protected template = '';
    protected styles = '';
    protected clientScript = '';
    private static handlebarsInitialized = false;
    private static commonCss = '';
    
    private static errorOverlayCss = '';
    private static errorOverlayJs = '';
    private static errorOverlayHtml = '';
    
    private static baseOverlayCss = '';
    private static baseOverlayJs = '';
    
    private static passwordInputOverlayCss = '';
    private static passwordInputOverlayJs = '';
    private static passwordInputOverlayHtml = '';
    
    private static warningOverlayCss = '';
    private static warningOverlayJs = '';
    private static warningOverlayHtml = '';
    
    private static announcementOverlayCss = '';
    private static announcementOverlayJs = '';
    private static announcementOverlayHtml = '';
    
    private messageCallback?: (message: Record<string, unknown>) => void;
    private navigationCallback?: (viewId: string, params?: Record<string, unknown>, panel?: 'sidebar' | 'editor') => Promise<void>;
    private refreshCallback?: (params?: Record<string, unknown>) => void;
    private baseOverlayEnabled = false;

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
            BaseViewController.commonCss = this.loadTemplate('common/common.css');
        }
        
        // Load base overlay assets once for all views
        if (!BaseViewController.baseOverlayCss) {
            BaseViewController.baseOverlayCss = this.loadTemplate('common/overlay/baseOverlay.css');
            BaseViewController.baseOverlayJs = this.loadTemplate('common/overlay/baseOverlay.js');
        }
        
        // Load error overlay assets once for all views
        if (!BaseViewController.errorOverlayCss) {
            BaseViewController.errorOverlayCss = this.loadTemplate('common/errorOverlay/errorOverlay.css');
            BaseViewController.errorOverlayJs = this.loadTemplate('common/errorOverlay/errorOverlay.js');
            BaseViewController.errorOverlayHtml = this.loadTemplate('common/errorOverlay/errorOverlay.html');
        }
        
        // Load password input overlay assets once for all views
        if (!BaseViewController.passwordInputOverlayCss) {
            BaseViewController.passwordInputOverlayCss = this.loadTemplate('common/passwordInputOverlay/passwordInputOverlay.css');
            BaseViewController.passwordInputOverlayJs = this.loadTemplate('common/passwordInputOverlay/passwordInputOverlay.js');
            BaseViewController.passwordInputOverlayHtml = this.loadTemplate('common/passwordInputOverlay/passwordInputOverlay.html');
        }
        
        // Load warning overlay assets once for all views
        if (!BaseViewController.warningOverlayCss) {
            BaseViewController.warningOverlayCss = this.loadTemplate('common/warningOverlay/warningOverlay.css');
            BaseViewController.warningOverlayJs = this.loadTemplate('common/warningOverlay/warningOverlay.js');
            BaseViewController.warningOverlayHtml = this.loadTemplate('common/warningOverlay/warningOverlay.html');
        }
        
        // Load announcement overlay assets once for all views
        if (!BaseViewController.announcementOverlayCss) {
            BaseViewController.announcementOverlayCss = this.loadTemplate('common/announcementOverlay/announcementOverlay.css');
            BaseViewController.announcementOverlayJs = this.loadTemplate('common/announcementOverlay/announcementOverlay.js');
            BaseViewController.announcementOverlayHtml = this.loadTemplate('common/announcementOverlay/announcementOverlay.html');
        }
    }

    /**
     * Set the callback for sending messages to the webview.
     * This is called by the provider when it wants to receive async messages from the view.
     */
    public setMessageCallback(callback: (message: Record<string, unknown>) => void): void {
        this.messageCallback = callback;
    }

    /**
     * Set the callback for navigation requests from views.
     * This allows views to trigger navigation programmatically.
     */
    public setNavigationCallback(callback: (viewId: string, params?: Record<string, unknown>, panel?: 'sidebar' | 'editor') => Promise<void>): void {
        this.navigationCallback = callback;
    }

    /**
     * Set the callback for refreshing the webview HTML.
     * This is called by the provider to enable views to update their content.
     */
    public setRefreshCallback(callback: (params?: Record<string, unknown>) => void): void {
        this.refreshCallback = callback;
    }

    /**
     * Request navigation to another view.
     * This is called by views when they need to navigate programmatically.
     */
    protected async navigateTo(viewId: string, params?: Record<string, unknown>, panel?: 'sidebar' | 'editor'): Promise<void> {
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
    protected async refresh(params?: Record<string, unknown>): Promise<void> {
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
    protected sendMessageToWebview(message: Record<string, unknown>): void {
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
    abstract render(params?: Record<string, unknown>, nonce?: string): Promise<string>;

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
     * Show error overlay with the given title and details.
     * 
     * @param title - The error title displayed in the overlay header
     * @param details - The error details/message displayed in the overlay body
     * @param error - The original error object or message
     * @param buttonText - Optional custom text for the close button
     */
    protected showErrorOverlay(title: string, details: string, error: string, buttonText?: string): void {
        this.sendMessageToWebview({
            type: 'show-error-overlay',
            errorTitle: title,
            errorDetails: details,
            error: error,
            buttonText: buttonText
        });
    }

    /**
     * Get error overlay CSS to include in view styles.
     * Views that want error overlay support should append this to their styles.
     */
    protected getErrorOverlayCss(): string {
        return BaseViewController.errorOverlayCss;
    }

    /**
     * Get error overlay JS to include in view scripts.
     * Views that want error overlay support should prepend this to their clientScript
     * (it must load first to define window.showErrorOverlay and acquire VS Code API).
     */
    protected getErrorOverlayJs(): string {
        return BaseViewController.errorOverlayJs;
    }

    /**
     * Get error overlay HTML template to include in rendered output.
     * Views that want error overlay support should include this in their render output.
     */
    protected getErrorOverlayHtml(): string {
        return BaseViewController.errorOverlayHtml;
    }

    /**
     * Ensure base overlay support is enabled for this view.
     * Base overlay must be loaded before any specific overlay (error, password input, etc.)
     * This method is idempotent - it will only add base overlay assets once.
     */
    protected ensureBaseOverlay(): void {
        if (this.baseOverlayEnabled) {
            return;
        }
        
        this.styles = this.styles + '\n' + BaseViewController.baseOverlayCss;
        this.clientScript = BaseViewController.baseOverlayJs + '\n' + this.clientScript;
        
        this.baseOverlayEnabled = true;
    }

    /**
     * Enable error overlay support for this view.
     * Call this in constructor after setting up template, styles, and clientScript.
     * This will append error overlay CSS/JS and the view should include getErrorOverlayHtml() in render output.
     */
    protected enableErrorOverlay(): void {
        // Ensure base overlay is loaded first
        this.ensureBaseOverlay();
        
        // Append error overlay CSS to styles
        this.styles = this.styles + '\n' + BaseViewController.errorOverlayCss;
        
        // Append error overlay JS (after base overlay)
        this.clientScript = this.clientScript + '\n' + BaseViewController.errorOverlayJs;
    }

    /**
     * Enable password input overlay support for this view.
     * Call this in constructor after setting up template, styles, and clientScript.
     * This will append password input overlay CSS/JS and the view should include getPasswordInputOverlayHtml() in render output.
     */
    protected enablePasswordInputOverlay(): void {
        // Ensure base overlay is loaded first
        this.ensureBaseOverlay();
        
        // Append password input overlay CSS to styles
        this.styles = this.styles + '\n' + BaseViewController.passwordInputOverlayCss;
        
        // Append password input overlay JS
        this.clientScript = this.clientScript + '\n' + BaseViewController.passwordInputOverlayJs;
    }

    /**
     * Get password input overlay HTML template to include in rendered output.
     * Views that want password input overlay support should include this in their render output.
     */
    protected getPasswordInputOverlayHtml(): string {
        return BaseViewController.passwordInputOverlayHtml;
    }

    /**
     * Enable warning overlay support for this view.
     * Call this in constructor after setting up template, styles, and clientScript.
     * This will append warning overlay CSS/JS and the view should include getWarningOverlayHtml() in render output.
     */
    protected enableWarningOverlay(): void {
        // Ensure base overlay is loaded first
        this.ensureBaseOverlay();
        
        // Append warning overlay CSS to styles
        this.styles = this.styles + '\n' + BaseViewController.warningOverlayCss;
        
        // Append warning overlay JS (after base overlay)
        this.clientScript = this.clientScript + '\n' + BaseViewController.warningOverlayJs;
    }

    /**
     * Get warning overlay HTML template to include in rendered output.
     * Views that want warning overlay support should include this in their render output.
     */
    protected getWarningOverlayHtml(): string {
        return BaseViewController.warningOverlayHtml;
    }

    /**
     * Enable announcement overlay support for this view.
     * Call this in constructor after setting up template, styles, and clientScript.
     * This will append announcement overlay CSS/JS and the view should include
     * getAnnouncementOverlayHtml() in render output.
     * 
     * Use this for one-time product announcements (e.g. introducing a new feature),
     * gated on some persisted "seen" flag (see ExtensionStateService) so it is never
     * shown again once dismissed.
     */
    protected enableAnnouncementOverlay(): void {
        // Ensure base overlay is loaded first
        this.ensureBaseOverlay();
        
        // Append announcement overlay CSS to styles
        this.styles = this.styles + '\n' + BaseViewController.announcementOverlayCss;
        
        // Append announcement overlay JS (after base overlay)
        this.clientScript = this.clientScript + '\n' + BaseViewController.announcementOverlayJs;
    }

    /**
     * Get announcement overlay HTML template to include in rendered output.
     */
    protected getAnnouncementOverlayHtml(): string {
        return BaseViewController.announcementOverlayHtml;
    }

    /**
     * Load a template file from the filesystem.
     * @param relativePath Path to the file relative to views/ (e.g. 'devices/list/deviceList.html').
     *   __dirname here is baseViewController's own module location, which already sits at the views
     *   root under ts-jest/unbundled tsc, but collapses to the single dist/ bundle dir once esbuild
     *   bundles everything into dist/extension.js - hence the two-tier lookup below.
     */
    protected loadTemplate(relativePath: string): string {
        try {
            return readFileSync(path.resolve(__dirname, relativePath), 'utf8');
        } catch {
            try {
                return readFileSync(path.resolve(__dirname, 'views', relativePath), 'utf8');
            } catch (error) {
                this.logger.error('Failed to load template', { relativePath, error });
                return '';
            }
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
    protected renderTemplate(template: string, data: Record<string, unknown>): string {
        const startTime = Date.now();
        
        try {
            // Compile the template
            const compiledTemplate = Handlebars.compile(template, {
                noEscape: false, // Enable HTML escaping for security
                strict: false   // Allow accessing undefined properties without errors
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
