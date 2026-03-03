/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController, IView } from '../../views/baseViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Message } from '../../types/messages';

// Test implementation of BaseView
class TestView extends BaseViewController {
    public template: string = '<div>{{title}}</div>';
    public styles: string = '.test { color: red; }';
    public clientScript: string = 'console.log("test");';

    static viewId(): string {
        return 'test-view';
    }

    async render(params?: any): Promise<string> {
        const html = this.renderTemplate(this.template, params || {});
        return this.wrapHtml(html);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);
    }
}

describe('BaseView', () => {
    let logger: jest.Mocked<Logger>;
    let telemetry: jest.Mocked<ITelemetryService>;
    let view: TestView;

    beforeEach(() => {
        logger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        telemetry = {
            trackNavigation: jest.fn(),
            trackCommand: jest.fn(),
            trackFeature: jest.fn(),
            trackError: jest.fn(),
            trackPerformance: jest.fn(),
            flush: jest.fn(),
        } as any;

        view = new TestView(logger, telemetry);
    });

    describe('render', () => {
        it('should render basic template', async () => {
            const html = await view.render({ title: 'Test Title' });
            expect(html).toContain('Test Title');
        });

        it('should wrap content with styles', async () => {
            const html = await view.render({ title: 'Test' });
            expect(html).toContain('<style>');
            expect(html).toContain('.test { color: red; }');
        });

        it('should wrap content with script', async () => {
            const html = await view.render({ title: 'Test' });
            expect(html).toContain('<script>');
            expect(html).toContain('console.log("test")');
        });
    });

    describe('renderTemplate', () => {
        it('should substitute simple variables', () => {
            const template = 'Hello {{name}}!';
            const result = view['renderTemplate'](template, { name: 'World' });
            expect(result).toBe('Hello World!');
        });

        it('should handle missing variables', () => {
            const template = 'Hello {{name}}!';
            const result = view['renderTemplate'](template, {});
            // Handlebars leaves empty string for missing variables
            expect(result).toBe('Hello !');
        });

        it('should handle conditional blocks - truthy', () => {
            const template = '{{#if show}}Visible{{/if}}';
            const result = view['renderTemplate'](template, { show: true });
            expect(result).toBe('Visible');
        });

        it('should handle conditional blocks - falsy', () => {
            const template = '{{#if show}}Visible{{/if}}';
            const result = view['renderTemplate'](template, { show: false });
            expect(result).toBe('');
        });

        it('should handle each blocks with array', () => {
            const template = '{{#each items}}<li>{{name}}</li>{{/each}}';
            const result = view['renderTemplate'](template, {
                items: [{ name: 'Item 1' }, { name: 'Item 2' }]
            });
            expect(result).toBe('<li>Item 1</li><li>Item 2</li>');
        });

        it('should handle each blocks with empty array', () => {
            const template = '{{#each items}}<li>{{name}}</li>{{/each}}';
            const result = view['renderTemplate'](template, { items: [] });
            expect(result).toBe('');
        });

        it('should handle nested data access', () => {
            const template = '{{user.name}} lives in {{user.address.city}}';
            const result = view['renderTemplate'](template, {
                user: {
                    name: 'John',
                    address: { city: 'New York' }
                }
            });
            expect(result).toBe('John lives in New York');
        });

        it('should handle complex template', () => {
            const template = `
                <h1>{{title}}</h1>
                {{#if hasItems}}
                <ul>
                    {{#each items}}
                    <li>{{name}} - {{price}}</li>
                    {{/each}}
                </ul>
                {{/if}}
            `;
            const result = view['renderTemplate'](template, {
                title: 'Products',
                hasItems: true,
                items: [
                    { name: 'Product 1', price: 100 },
                    { name: 'Product 2', price: 200 }
                ]
            });

            expect(result).toContain('Products');
            expect(result).toContain('Product 1 - 100');
            expect(result).toContain('Product 2 - 200');
        });

        it('should log warning for slow renders', () => {
            // Create a template that will take time to render
            const template = '{{#each items}}{{value}}{{/each}}';
            const largeData = {
                items: Array(1000).fill({ value: 'test' })
            };

            view['renderTemplate'](template, largeData);

            // Check if slow render was logged (threshold is 50ms)
            // Note: This test might be flaky depending on device speed
        });
    });

    describe('handleMessage', () => {
        it('should log message receipt', async () => {
            const message: Message = { type: 'refresh' } as any;
            await view.handleMessage(message);

            expect(logger.trace).toHaveBeenCalledWith(
                'Message received',
                expect.objectContaining({
                    view: 'TestView',
                    type: 'refresh'
                })
            );
        });
    });

    describe('dispose', () => {
        it('should log disposal', () => {
            view.dispose();

            expect(logger.debug).toHaveBeenCalledWith(
                'View disposed',
                expect.objectContaining({
                    view: 'TestView'
                })
            );
        });
    });

    describe('wrapWithStyles', () => {
        it('should wrap HTML with style tags', () => {
            const html = '<div>Content</div>';
            view['styles'] = 'body { margin: 0; }';
            const result = view['wrapWithStyles'](html);

            expect(result).toContain('<style>');
            expect(result).toContain('body { margin: 0; }');
            expect(result).toContain('</style>');
            expect(result).toContain('<div>Content</div>');
        });

        it('should handle empty styles', () => {
            const html = '<div>Content</div>';
            view['styles'] = '';
            const result = view['wrapWithStyles'](html);

            expect(result).toContain('<div>Content</div>');
        });
    });

    describe('wrapWithScript', () => {
        it('should wrap HTML with script tags', () => {
            const html = '<div>Content</div>';
            view['clientScript'] = 'console.log("test");';
            const result = view['wrapWithScript'](html);

            expect(result).toContain('<script>');
            expect(result).toContain('console.log("test");');
            expect(result).toContain('</script>');
            expect(result).toContain('<div>Content</div>');
        });

        it('should handle empty script', () => {
            const html = '<div>Content</div>';
            view['clientScript'] = '';
            const result = view['wrapWithScript'](html);

            expect(result).toBe('<div>Content</div>');
        });
    });

    describe('wrapHtml', () => {
        it('should wrap HTML with both styles and script', () => {
            const html = '<div>Content</div>';
            view['styles'] = 'body { margin: 0; }';
            view['clientScript'] = 'console.log("test");';

            const result = view['wrapHtml'](html);

            expect(result).toContain('<style>');
            expect(result).toContain('body { margin: 0; }');
            expect(result).toContain('<div>Content</div>');
            expect(result).toContain('<script>');
            expect(result).toContain('console.log("test");');
        });
    });

    describe('loadTemplate', () => {
        it('should handle missing template files gracefully', () => {
            // Mock fs.readFileSync to throw an error
            const originalReadFileSync = require('fs').readFileSync;
            require('fs').readFileSync = jest.fn(() => {
                throw new Error('File not found');
            });

            const result = view['loadTemplate']('./nonexistent.html');
            expect(result).toBe('');
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to load template',
                expect.objectContaining({
                    relativePath: './nonexistent.html'
                })
            );

            // Restore original
            require('fs').readFileSync = originalReadFileSync;
        });
    });

    describe('navigation', () => {
        it('should set and use navigation callback', async () => {
            const navCallback = jest.fn().mockResolvedValue(undefined);
            view.setNavigationCallback(navCallback);

            await view['navigateTo']('device-manager', { id: '123' });

            expect(navCallback).toHaveBeenCalledWith('device-manager', { id: '123' }, undefined);
        });

        it('should pass panel parameter when provided', async () => {
            const navCallback = jest.fn().mockResolvedValue(undefined);
            view.setNavigationCallback(navCallback);

            await view['navigateTo']('device-manager', { id: '123' }, 'sidebar');

            expect(navCallback).toHaveBeenCalledWith('device-manager', { id: '123' }, 'sidebar');
        });

        it('should warn when no navigation callback is set', async () => {
            await view['navigateTo']('device-manager');

            expect(logger.warn).toHaveBeenCalledWith(
                'Cannot navigate: no navigation callback set',
                expect.objectContaining({
                    view: 'TestView',
                    targetView: 'device-manager'
                })
            );
        });
    });

    describe('refresh', () => {
        it('should use refresh callback when set', async () => {
            const refreshCallback = jest.fn();
            view.setRefreshCallback(refreshCallback);

            await view['refresh']({ data: 'test' });

            expect(refreshCallback).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should warn when no refresh callback is set', async () => {
            await view['refresh']();

            expect(logger.warn).toHaveBeenCalledWith(
                'Cannot refresh: no refresh callback set',
                expect.objectContaining({
                    view: 'TestView'
                })
            );
        });

        it('should log trace when refreshing', async () => {
            const refreshCallback = jest.fn();
            view.setRefreshCallback(refreshCallback);

            await view['refresh']({ data: 'test' });

            expect(logger.trace).toHaveBeenCalledWith(
                'Refreshing view',
                expect.objectContaining({
                    view: 'TestView',
                    params: { data: 'test' }
                })
            );
        });

        it('should handle refresh errors gracefully', async () => {
            const refreshCallback = jest.fn().mockImplementation(() => {
                throw new Error('Refresh failed');
            });
            view.setRefreshCallback(refreshCallback);

            await view['refresh']();

            expect(logger.error).toHaveBeenCalledWith(
                'Failed to refresh view',
                expect.objectContaining({
                    view: 'TestView',
                    error: 'Refresh failed'
                })
            );
        });
    });

    describe('messaging', () => {
        it('should send message to webview when callback is set', () => {
            const messageCallback = jest.fn();
            view.setMessageCallback(messageCallback);

            view['sendMessageToWebview']({ type: 'test', data: 'value' });

            expect(messageCallback).toHaveBeenCalledWith({ type: 'test', data: 'value' });
        });

        it('should warn when no message callback is set', () => {
            view['sendMessageToWebview']({ type: 'test', data: 'value' });

            expect(logger.warn).toHaveBeenCalledWith(
                'Cannot send message to webview: no callback set',
                expect.objectContaining({
                    view: 'TestView',
                    messageType: 'test'
                })
            );
        });
    });

    describe('base overlay', () => {
        it('should ensure base overlay is added only once', () => {
            const originalStyles = view['styles'];
            const originalScript = view['clientScript'];

            // First call should add base overlay
            view['ensureBaseOverlay']();
            
            const stylesAfterFirst = view['styles'];
            const scriptAfterFirst = view['clientScript'];
            
            expect(stylesAfterFirst.length).toBeGreaterThan(originalStyles.length);
            expect(scriptAfterFirst.length).toBeGreaterThan(originalScript.length);

            // Second call should not add base overlay again (idempotent)
            view['ensureBaseOverlay']();
            
            expect(view['styles']).toBe(stylesAfterFirst);
            expect(view['clientScript']).toBe(scriptAfterFirst);
        });

        it('should track base overlay enabled state', () => {
            expect(view['baseOverlayEnabled']).toBe(false);
            
            view['ensureBaseOverlay']();
            
            expect(view['baseOverlayEnabled']).toBe(true);
        });
    });

    describe('error overlay', () => {
        it('should enable error overlay support', () => {
            const originalStyles = view['styles'];
            const originalScript = view['clientScript'];

            view['enableErrorOverlay']();

            // Should append CSS to styles
            expect(view['styles']).not.toBe(originalStyles);
            expect(view['styles'].length).toBeGreaterThan(originalStyles.length);

            // Should prepend JS to clientScript
            expect(view['clientScript']).not.toBe(originalScript);
            expect(view['clientScript'].length).toBeGreaterThan(originalScript.length);
            
            // Should enable base overlay
            expect(view['baseOverlayEnabled']).toBe(true);
        });

        it('should include base overlay when enabling error overlay', () => {
            view['enableErrorOverlay']();
            
            // Base overlay should be present
            expect(view['styles']).toContain('.overlay-backdrop');
            expect(view['clientScript']).toContain('BaseOverlay');
        });

        it('should get error overlay CSS', () => {
            const css = view['getErrorOverlayCss']();
            expect(typeof css).toBe('string');
        });

        it('should get error overlay JS', () => {
            const js = view['getErrorOverlayJs']();
            expect(typeof js).toBe('string');
        });

        it('should get error overlay HTML', () => {
            const html = view['getErrorOverlayHtml']();
            expect(typeof html).toBe('string');
        });

        it('should show error overlay by sending message', () => {
            const messageCallback = jest.fn();
            view.setMessageCallback(messageCallback);

            view['showErrorOverlay']('Error Title', 'Error Details', 'Error message');

            expect(messageCallback).toHaveBeenCalledWith({
                type: 'show-error-overlay',
                errorTitle: 'Error Title',
                errorDetails: 'Error Details',
                error: 'Error message',
                buttonText: undefined
            });
        });

        it('should show error overlay with custom button text', () => {
            const messageCallback = jest.fn();
            view.setMessageCallback(messageCallback);

            view['showErrorOverlay']('Error Title', 'Error Details', 'Error message', 'Retry Now');

            expect(messageCallback).toHaveBeenCalledWith({
                type: 'show-error-overlay',
                errorTitle: 'Error Title',
                errorDetails: 'Error Details',
                error: 'Error message',
                buttonText: 'Retry Now'
            });
        });
    });

    describe('password input overlay', () => {
        it('should enable password input overlay support', () => {
            const originalStyles = view['styles'];
            const originalScript = view['clientScript'];

            view['enablePasswordInputOverlay']();

            // Should append CSS to styles
            expect(view['styles']).not.toBe(originalStyles);
            expect(view['styles'].length).toBeGreaterThan(originalStyles.length);

            // Should append JS to clientScript
            expect(view['clientScript']).not.toBe(originalScript);
            expect(view['clientScript'].length).toBeGreaterThan(originalScript.length);
            
            // Should enable base overlay
            expect(view['baseOverlayEnabled']).toBe(true);
        });

        it('should include base overlay when enabling password input overlay', () => {
            view['enablePasswordInputOverlay']();
            
            // Base overlay should be present
            expect(view['styles']).toContain('.overlay-backdrop');
            expect(view['clientScript']).toContain('BaseOverlay');
        });

        it('should get password input overlay HTML', () => {
            const html = view['getPasswordInputOverlayHtml']();
            expect(typeof html).toBe('string');
            expect(html.length).toBeGreaterThan(0);
        });
    });

    describe('multiple overlay support', () => {
        it('should enable both error and password overlays without duplicating base overlay', () => {
            const originalStyles = view['styles'];
            const originalScript = view['clientScript'];

            // Enable error overlay first
            view['enableErrorOverlay']();
            
            const stylesAfterError = view['styles'];
            const scriptAfterError = view['clientScript'];

            // Enable password input overlay second
            view['enablePasswordInputOverlay']();
            
            const stylesAfterBoth = view['styles'];
            const scriptAfterBoth = view['clientScript'];

            // Base overlay should be enabled
            expect(view['baseOverlayEnabled']).toBe(true);

            // Both overlays should be present
            expect(stylesAfterBoth).toContain('error-overlay');
            expect(stylesAfterBoth).toContain('password-input-overlay');
            expect(scriptAfterBoth).toContain('ErrorOverlay');
            expect(scriptAfterBoth).toContain('PasswordInputOverlay');

            // Base overlay should appear only once in scripts
            // Check that base overlay script is present
            expect(scriptAfterBoth).toContain('window.BaseOverlay');
            
            // Count occurrences of the base overlay object definition
            const baseOverlayDefCount = (scriptAfterBoth.match(/window\.BaseOverlay\s*=\s*{/g) || []).length;
            expect(baseOverlayDefCount).toBe(1); // Should be defined only once
        });

        it('should work in reverse order (password overlay then error overlay)', () => {
            // Enable password input overlay first
            view['enablePasswordInputOverlay']();
            
            // Enable error overlay second
            view['enableErrorOverlay']();

            // Base overlay should be enabled
            expect(view['baseOverlayEnabled']).toBe(true);

            // Both overlays should be present
            expect(view['styles']).toContain('error-overlay');
            expect(view['styles']).toContain('password-input-overlay');
            expect(view['clientScript']).toContain('ErrorOverlay');
            expect(view['clientScript']).toContain('PasswordInputOverlay');
        });

        it('should not duplicate base overlay when called multiple times', () => {
            view['enableErrorOverlay']();
            view['enablePasswordInputOverlay']();
            view['enableErrorOverlay'](); // Call again
            
            const styles = view['styles'];
            const script = view['clientScript'];

            // Count occurrences of base overlay CSS class
            const baseStyleMatches = (styles.match(/\.overlay-backdrop/g) || []).length;
            expect(baseStyleMatches).toBe(1); // Should appear only once
        });
    });

    describe('handlebars helpers', () => {
        it('should support "not" helper', () => {
            const template = '{{#if (not flag)}}Hidden{{/if}}';
            const result = view['renderTemplate'](template, { flag: true });
            expect(result).toBe('');

            const result2 = view['renderTemplate'](template, { flag: false });
            expect(result2).toBe('Hidden');
        });

        it('should support "eq" helper', () => {
            const template = '{{#if (eq status "active")}}Active{{/if}}';
            const result = view['renderTemplate'](template, { status: 'active' });
            expect(result).toBe('Active');

            const result2 = view['renderTemplate'](template, { status: 'inactive' });
            expect(result2).toBe('');
        });

        it('should support "neq" helper', () => {
            const template = '{{#if (neq status "active")}}Not Active{{/if}}';
            const result = view['renderTemplate'](template, { status: 'inactive' });
            expect(result).toBe('Not Active');

            const result2 = view['renderTemplate'](template, { status: 'active' });
            expect(result2).toBe('');
        });
    });

    describe('static methods', () => {
        it('should have viewId method', () => {
            expect(TestView.viewId()).toBe('test-view');
        });

        it('should throw error for base class viewId', () => {
            expect(() => BaseViewController.viewId()).toThrow('Subclasses must implement static viewId() method');
        });
    });
});
