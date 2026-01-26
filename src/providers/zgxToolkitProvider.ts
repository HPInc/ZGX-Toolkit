/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { IView } from '../views/baseViewController';
import { ViewFactory } from '../views/viewFactory';
import { MessageRouter } from '../utils/messageRouter';
import { Logger } from '../utils/logger';
import { Message, NavigateMessage } from '../types/messages';

/**
 * Unified provider that handles both sidebar and editor panel webviews.
 * Implements WebviewViewProvider for sidebar integration and manages editor panels.
 * 
 * Views are responsible for subscribing to store updates and refreshing themselves.
 */
export class ZgxToolkitProvider implements vscode.WebviewViewProvider {
    private sidebarView?: vscode.WebviewView;
    private sidebarWebview?: vscode.Webview;
    private sidebarCurrentView?: IView;
    private sidebarCurrentViewId?: string;

    private editorPanel?: vscode.WebviewPanel;
    private editorWebview?: vscode.Webview;
    private editorCurrentView?: IView;
    private editorCurrentViewId?: string;

    private readonly nonce: string;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly viewFactory: ViewFactory,
        private readonly messageRouter: MessageRouter,
        private readonly logger: Logger
    ) {
        // Generate nonce once for the provider's lifetime
        this.nonce = this.generateNonce();

        this.logger.debug('Provider initialized');
    }

    /**
     * Called when the sidebar view is resolved
     * @param webviewView The webview view to resolve
     * @param context The context for the webview view
     * @param token Cancellation token
     */
    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.logger.info('Resolving sidebar webview');

        this.sidebarView = webviewView;
        this.sidebarWebview = webviewView.webview;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        // Set up message listener
        webviewView.webview.onDidReceiveMessage(
            message => this.handleSidebarMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Handle view visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.logger.debug('Sidebar became visible');
                // Optionally refresh the current view
                if (this.sidebarCurrentViewId && this.sidebarCurrentView) {
                    this.navigateSidebar(this.sidebarCurrentViewId).catch(error => {
                        this.logger.error('Failed to refresh sidebar view on visibility change', { error });
                    });
                }
            }
        }, undefined, this.context.subscriptions);

        // Handle view disposal
        webviewView.onDidDispose(() => {
            this.logger.debug('Sidebar webview disposed');
            this.disposeSidebar();
        }, undefined, this.context.subscriptions);

        // Load initial view
        await this.navigateSidebar('devices/list');

        this.logger.info('Sidebar webview resolved successfully');
    }

    /**
     * Handle messages from the sidebar
     * @param message The message from the sidebar webview
     */
    private async handleSidebarMessage(message: Message): Promise<void> {
        this.logger.trace('Sidebar received message', { type: message.type });

        // Check if this is a navigate message with editor target
        if (message.type === 'navigate') {
            const navMsg = message as NavigateMessage;
            this.logger.debug('Navigation message from sidebar', {
                targetView: navMsg.targetView,
                panel: navMsg.panel,
                params: navMsg.params
            });
            
            if (navMsg.panel === 'editor') {
                this.logger.debug('Opening editor for navigation');
                await this.openInEditor(navMsg.targetView, navMsg.params);
                return;
            }
        }

        // Handle message for sidebar
        await this.handleMessage(message, 'sidebar');
    }

    /**
     * Open a view in an editor panel
     * @param viewId Optional view ID to navigate to (defaults to 'devices/manager')
     * @param params Optional parameters for the view
     */
    async openInEditor(viewId: string = 'devices/manager', params?: any): Promise<void> {
        this.logger.debug('Opening view in editor panel', { viewId, params });

        // If editor panel already exists, reuse it
        if (this.editorPanel) {
            this.logger.trace('Editor panel already exists, revealing and navigating');
            this.editorPanel.reveal();
            await this.navigateEditor(viewId, params);
            return;
        }

        // Create new editor panel
        const panel = vscode.window.createWebviewPanel(
            'zgxToolkitEditor',
            'ZGX Device Manager',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        panel.iconPath = {
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'editortab-icon-dark.svg'),
            light: vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'editortab-icon-light.svg')
        };

        this.editorPanel = panel;
        this.editorWebview = panel.webview;

        // Configure webview
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        // Set up message listener
        panel.webview.onDidReceiveMessage(
            async (message: Message) => {
                this.logger.trace('Editor panel received message', { type: message.type });

                // Handle navigation messages for editor panel
                if (message.type === 'navigate') {
                    const navMsg = message as NavigateMessage;
                    // If panel is editor or not specified, navigate within editor
                    if (navMsg.panel === 'editor' || !navMsg.panel) {
                        await this.navigateEditor(navMsg.targetView, navMsg.params);
                        return;
                    }
                }

                // Handle other messages
                await this.handleMessage(message, 'editor');
            },
            undefined,
            this.context.subscriptions
        );

        // Handle panel disposal
        panel.onDidDispose(() => {
            this.logger.debug('Editor panel disposed');
            this.disposeEditor();
        }, undefined, this.context.subscriptions);

        // Navigate to the initial view
        await this.navigateEditor(viewId, params);

        this.logger.debug('Editor panel opened successfully');
    }

    /**
     * Navigate to a specific view
     * @param viewId The view identifier
     * @param params Optional parameters to pass to the view
     * @param target The target display ('sidebar' or 'editor')
     */
    private async navigateTo(viewId: string, params: any, target: 'sidebar' | 'editor'): Promise<void> {
        if (target === 'sidebar') {
            await this.navigateSidebar(viewId, params);
        } else {
            // If navigating to editor but it doesn't exist, open it first
            if (!this.editorPanel) {
                this.logger.debug('Editor panel does not exist, opening it first');
                await this.openInEditor(viewId, params);
            } else {
                await this.navigateEditor(viewId, params);
            }
        }
    }

    /**
     * Navigate the sidebar to a specific view
     * @param viewId The view identifier
     * @param params Optional parameters to pass to the view
     */
    private async navigateSidebar(viewId: string, params?: any): Promise<void> {
        this.logger.debug('Navigating sidebar to view', { viewId, params });

        try {
            // Dispose current sidebar view
            if (this.sidebarCurrentView) {
                this.sidebarCurrentView.dispose();
            }

            // Create new view
            this.sidebarCurrentView = this.viewFactory.create(viewId);
            this.sidebarCurrentViewId = viewId;

            // Set message callback so view can send async messages back
            this.sidebarCurrentView.setMessageCallback((message: any) => {
                if (this.sidebarWebview) {
                    this.sidebarWebview.postMessage(message);
                    this.logger.trace('Sent message to sidebar webview', { type: message.type });
                }
            });

            // Set navigation callback so view can trigger navigation
            this.sidebarCurrentView.setNavigationCallback(async (targetViewId: string, params?: any, panel?: 'sidebar' | 'editor') => {
                const navigationTarget = panel || 'sidebar';
                await this.navigateTo(targetViewId, params, navigationTarget);
            });            

            // Set refresh callback so view can update the webview HTML
            this.sidebarCurrentView.setRefreshCallback(async (params: any) => {
                await this.sidebarCurrentView?.render(params, this.nonce).then(html => {
                    if (this.sidebarWebview) {
                        this.sidebarWebview.html = this.getFullHtml(html);
                        this.logger.trace('Sidebar webview HTML updated via refresh callback');
                    }
                });
            });

            // Render view with nonce
            const html = await this.sidebarCurrentView.render(params, this.nonce);

            // Update webview
            if (this.sidebarWebview) {
                this.sidebarWebview.html = this.getFullHtml(html);
            }

            this.logger.debug('Sidebar navigation completed', { viewId });
        } catch (error) {
            this.logger.error('Sidebar navigation failed', {
                error: error instanceof Error ? error.message : String(error),
                viewId,
                stack: error instanceof Error ? error.stack : undefined
            });
            await this.showError(error, 'sidebar');
        }
    }

    /**
     * Navigate the editor panel to a specific view
     * @param viewId The view identifier
     * @param params Optional parameters to pass to the view
     */
    private async navigateEditor(viewId: string, params?: any): Promise<void> {
        if (!this.editorPanel) {
            this.logger.warn('Cannot navigate editor panel: panel does not exist');
            return;
        }

        this.logger.debug('Navigating editor panel to view', { viewId, params });

        try {
            // Dispose current editor view
            if (this.editorCurrentView) {
                this.editorCurrentView.dispose();
            }

            // Create new view
            this.editorCurrentView = this.viewFactory.create(viewId);
            this.editorCurrentViewId = viewId;

            // Set message callback so view can send async messages back
            this.editorCurrentView.setMessageCallback((message: any) => {
                if (this.editorWebview) {
                    this.editorWebview.postMessage(message);
                    this.logger.trace('Sent message to editor webview', { type: message.type });
                }
            });

            // Set navigation callback so view can trigger navigation
            this.editorCurrentView.setNavigationCallback(async (targetViewId: string, params?: any, panel?: 'sidebar' | 'editor') => {
                const navigationTarget = panel || 'editor';
                await this.navigateTo(targetViewId, params, navigationTarget);
            });

            // Set refresh callback so view can update the webview HTML
            this.editorCurrentView.setRefreshCallback(async (params: any) => {
                await this.editorCurrentView?.render(params, this.nonce).then(html => {
                    if (this.editorWebview) {
                        this.editorWebview.html = this.getFullHtml(html);
                        this.logger.trace('Editor webview HTML updated via refresh callback');
                    }
                });
            });

            // Render view with nonce
            const html = await this.editorCurrentView.render(params, this.nonce);

            // Update webview
            if (this.editorWebview) {
                this.editorWebview.html = this.getFullHtml(html);
            }
            this.editorPanel.reveal();

            this.logger.debug('Editor panel navigation completed', { viewId });
        } catch (error) {
            this.logger.error('Editor panel navigation failed', {
                error: error instanceof Error ? error.message : String(error),
                viewId,
                stack: error instanceof Error ? error.stack : undefined
            });
            await this.showError(error, 'editor');
        }
    }

    /**
     * Handle a message from the webview
     * @param message The message from the webview
     * @param target The target display ('sidebar' or 'editor')
     */
    private async handleMessage(message: Message, target: 'sidebar' | 'editor'): Promise<void> {
        this.logger.trace('Provider received message', { type: message.type, target });

        try {
            // Validate message
            if (!this.messageRouter.validateMessage(message)) {
                this.logger.warn('Invalid message received', { message, target });
                return;
            }

            // Handle navigation messages
            if (message.type === 'navigate') {
                const navMsg = message as NavigateMessage;
                // Use the message's panel if specified, otherwise use the context target
                const navigationTarget = navMsg.panel || target;
                await this.navigateTo(navMsg.targetView, navMsg.params, navigationTarget);
                return;
            }

            // Route to current view
            const currentView = target === 'sidebar' ? this.sidebarCurrentView : this.editorCurrentView;
            if (currentView) {
                await this.messageRouter.routeMessage(message, currentView);
            } else {
                this.logger.warn('No current view to handle message', { type: message.type, target });
            }
        } catch (error) {
            this.logger.error('Message handling failed', {
                error: error instanceof Error ? error.message : String(error),
                type: message.type,
                target,
                stack: error instanceof Error ? error.stack : undefined
            });
            await this.showError(error, target);
        }
    }

    /**
     * Generate the full HTML document for the webview
     * @param bodyHtml The HTML content for the body
     * @returns Complete HTML document
     */
    private getFullHtml(bodyHtml: string): string {
        // Get the webview to use for generating URIs
        const webview = this.editorWebview || this.sidebarWebview;
        
        // Generate URI for codicon resources
        let codiconCssUri = '';
        let codiconFontUri = '';
        
        if (webview) {
            const codiconCssPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'codicon.css');
            const codiconFontPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'codicon.ttf');
            codiconCssUri = webview.asWebviewUri(codiconCssPath).toString();
            codiconFontUri = webview.asWebviewUri(codiconFontPath).toString();
        }
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview?.cspSource} 'nonce-${this.nonce}'; font-src ${webview?.cspSource}; script-src ${webview?.cspSource} 'nonce-${this.nonce}';">
    <title>ZGX Toolkit</title>
    ${codiconCssUri ? `<link rel="stylesheet" href="${codiconCssUri}">` : ''}
</head>
<body>
    ${bodyHtml}
    <script nonce="${this.nonce}">
        const vscode = acquireVsCodeApi();
        
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Webview error:', event.error);
            vscode.postMessage({
                type: 'error',
                error: event.error?.message || 'Unknown error'
            });
        });
        
        // Prevent default context menu to use VS Code's
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    </script>
</body>
</html>`;
    }

    /**
     * Show an error view
     * @param error The error to display
     * @param target The target display ('sidebar' or 'editor')
     */
    private async showError(error: any, target: 'sidebar' | 'editor'): Promise<void> {
        try {
            const errorView = this.viewFactory.create('common/error');
            const html = await errorView.render({
                message: error instanceof Error ? error.message : String(error),
                canRetry: true
            }, this.nonce);

            const webview = target === 'sidebar' ? this.sidebarWebview : this.editorWebview;
            if (webview) {
                webview.html = this.getFullHtml(html);
            }
        } catch (err) {
            this.logger.error('Failed to show error view', {
                error: err instanceof Error ? err.message : String(err),
                target
            });
            // Fallback to simple error HTML
            const webview = target === 'sidebar' ? this.sidebarWebview : this.editorWebview;
            if (webview) {
                webview.html = this.getSimpleErrorHtml(error);
            }
        }
    }

    /**
     * Get a simple error HTML page (fallback when error view fails)
     * @param error The error to display
     * @returns Simple HTML error page
     */
    private getSimpleErrorHtml(error: any): string {
        const message = error instanceof Error ? error.message : String(error);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style nonce="${this.nonce}">
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 2rem;
            text-align: center;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 1rem;
        }
        .error-message {
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <div class="error-icon">⚠️</div>
    <h2>Error</h2>
    <p class="error-message">${this.escapeHtml(message)}</p>
</body>
</html>`;
    }

    /**
     * Escape HTML to prevent XSS
     * @param text The text to escape
     * @returns Escaped text
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Generate a nonce for Content Security Policy
     * @returns A random nonce string
     */
    private generateNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Refresh the sidebar view
     */
    async refreshSidebar(): Promise<void> {
        if (this.sidebarCurrentViewId) {
            this.logger.info('Refreshing sidebar view', { viewId: this.sidebarCurrentViewId });
            await this.navigateSidebar(this.sidebarCurrentViewId);
        }
    }

    /**
     * Refresh the editor panel view
     */
    async refreshEditor(): Promise<void> {
        if (this.editorCurrentViewId) {
            this.logger.info('Refreshing editor panel view', { viewId: this.editorCurrentViewId });
            await this.navigateEditor(this.editorCurrentViewId);
        }
    }

    /**
     * Show the sidebar view
     */
    showSidebar(): void {
        if (this.sidebarView) {
            this.sidebarView.show(true);
            this.logger.debug('Sidebar shown');
        }
    }

    /**
     * Clean up sidebar resources
     */
    private disposeSidebar(): void {
        if (this.sidebarCurrentView) {
            this.sidebarCurrentView.dispose();
            this.sidebarCurrentView = undefined;
        }
        this.sidebarCurrentViewId = undefined;
        this.sidebarWebview = undefined;
        this.sidebarView = undefined;
        this.logger.debug('Sidebar disposed');
    }

    /**
     * Clean up editor panel resources
     */
    private disposeEditor(): void {
        if (this.editorCurrentView) {
            this.editorCurrentView.dispose();
            this.editorCurrentView = undefined;
        }
        this.editorCurrentViewId = undefined;
        this.editorWebview = undefined;
        this.editorPanel = undefined;
        this.logger.debug('Editor panel disposed');
    }

    /**
     * Clean up all resources
     */
    dispose(): void {
        this.disposeSidebar();
        
        // Clean up editor panel
        if (this.editorPanel) {
            this.editorPanel.dispose();
        }
        this.disposeEditor();
        
        this.logger.debug('Provider fully disposed');
    }
}
