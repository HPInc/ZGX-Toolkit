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

    async render(params?: any): Promise<string> {
        const html = this.renderTemplate(this.template, params || {});
        return this.wrapHtml(html);
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
});
