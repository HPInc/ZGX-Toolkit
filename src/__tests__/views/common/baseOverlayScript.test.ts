/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/overlay/baseOverlay.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createElement(overrides: Record<string, unknown> = {}) {
    return {
        addEventListener: jest.fn(),
        remove: jest.fn(),
        style: {},
        ...overrides
    };
}

function createContext(extra: Record<string, unknown> = {}) {
    return {
        acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
        window: {},
        document: {
            getElementById: jest.fn(() => null),
            body: { appendChild: jest.fn(), style: {} }
        },
        console: { error: jest.fn() },
        ...extra
    };
}

describe('Base overlay webview script', () => {
    describe('VS Code API acquisition', () => {
        it('acquires the API once and exposes it as window.vscodeApi', () => {
            const context = createContext();

            loadScript(context);

            expect((context.acquireVsCodeApi as jest.Mock)).toHaveBeenCalledTimes(1);
            expect((context.window as any).vscodeApi).toBeDefined();
            expect((context.window as any).BaseOverlay).toBeDefined();
        });

        it('reuses an already-acquired VS Code API', () => {
            const existingApi = { postMessage: jest.fn() };
            const context = createContext({ window: { vscodeApi: existingApi } });

            loadScript(context);

            expect((context.acquireVsCodeApi as jest.Mock)).not.toHaveBeenCalled();
            expect((context.window as any).vscodeApi).toBe(existingApi);
        });

        it('logs and throws when the VS Code API cannot be acquired', () => {
            const context = createContext({
                acquireVsCodeApi: jest.fn(() => {
                    throw new Error('already acquired');
                })
            });

            expect(() => loadScript(context)).toThrow('VS Code API already acquired. Base overlay script must load first.');
            expect((context.console as any).error).toHaveBeenCalledWith(
                'Failed to acquire VS Code API. It may have already been acquired by another script.',
                expect.any(Error)
            );
        });
    });

    describe('BaseOverlay API', () => {
        let context: any;

        beforeEach(() => {
            context = createContext();
            loadScript(context);
        });

        it('show removes an existing backdrop, renders the template and attaches events', () => {
            const existingBackdrop = createElement();
            const overlayContent = createElement();
            const template = { content: { cloneNode: jest.fn(() => overlayContent) } };
            context.document.getElementById = jest.fn((id: string) => {
                if (id === 'my-backdrop') return existingBackdrop;
                if (id === 'my-template') return template;
                return null;
            });
            const onSetupContent = jest.fn();
            const onAttachEvents = jest.fn();

            context.window.BaseOverlay.show('my-template', {
                backdropId: 'my-backdrop',
                onSetupContent,
                onAttachEvents,
                callbacks: { foo: 'bar' }
            });

            expect(existingBackdrop.remove).toHaveBeenCalled();
            expect(onSetupContent).toHaveBeenCalledWith(overlayContent);
            expect(context.document.body.appendChild).toHaveBeenCalledWith(overlayContent);
            expect(onAttachEvents).toHaveBeenCalledWith({ foo: 'bar' });
            expect(context.document.body.style.overflow).toBe('hidden');
        });

        it('logs an error and returns without rendering when the template is missing', () => {
            context.document.getElementById = jest.fn(() => null);
            const onSetupContent = jest.fn();

            context.window.BaseOverlay.show('missing-template', { backdropId: 'bd', onSetupContent });

            expect(context.console.error).toHaveBeenCalledWith(expect.stringContaining('missing-template'));
            expect(onSetupContent).not.toHaveBeenCalled();
            expect(context.document.body.appendChild).not.toHaveBeenCalled();
        });

        it('renders successfully even without onSetupContent/onAttachEvents callbacks', () => {
            const overlayContent = createElement();
            const template = { content: { cloneNode: jest.fn(() => overlayContent) } };
            context.document.getElementById = jest.fn((id: string) => (id === 'tpl' ? template : null));

            expect(() => context.window.BaseOverlay.show('tpl', { backdropId: 'bd' })).not.toThrow();
            expect(context.document.body.appendChild).toHaveBeenCalledWith(overlayContent);
        });

        it('hide removes the backdrop and resets body overflow', () => {
            const backdrop = createElement();
            context.document.getElementById = jest.fn(() => backdrop);
            context.document.body.style.overflow = 'hidden';

            context.window.BaseOverlay.hide('bd');

            expect(backdrop.remove).toHaveBeenCalled();
            expect(context.document.body.style.overflow).toBe('');
        });

        it('hide is a no-op when the backdrop does not exist', () => {
            context.document.getElementById = jest.fn(() => null);

            expect(() => context.window.BaseOverlay.hide('bd')).not.toThrow();
            expect(context.document.body.style.overflow).toBe('');
        });

        it('preventBackdropClick prevents default only when the event target is the backdrop', () => {
            const event = { target: { id: 'bd' }, preventDefault: jest.fn(), stopPropagation: jest.fn() };

            context.window.BaseOverlay.preventBackdropClick(event, 'bd');

            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        });

        it('preventBackdropClick does nothing when the event target is not the backdrop', () => {
            const event = { target: { id: 'other' }, preventDefault: jest.fn(), stopPropagation: jest.fn() };

            context.window.BaseOverlay.preventBackdropClick(event, 'bd');

            expect(event.preventDefault).not.toHaveBeenCalled();
            expect(event.stopPropagation).not.toHaveBeenCalled();
        });

        it('stopEventPropagation stops propagation on the event', () => {
            const event = { stopPropagation: jest.fn() };

            context.window.BaseOverlay.stopEventPropagation(event);

            expect(event.stopPropagation).toHaveBeenCalled();
        });

        it('sendMessage posts the message through the VS Code API', () => {
            context.window.BaseOverlay.sendMessage({ type: 'test' });

            expect(context.window.vscodeApi.postMessage).toHaveBeenCalledWith({ type: 'test' });
        });

        describe('executeCallback', () => {
            it('hides the overlay first when shouldHideOverlay and backdropId are provided', () => {
                const backdrop = createElement();
                context.document.getElementById = jest.fn(() => backdrop);

                context.window.BaseOverlay.executeCallback(null, true, 'bd');

                expect(backdrop.remove).toHaveBeenCalled();
                expect(context.document.body.style.overflow).toBe('');
            });

            it('does not hide the overlay when shouldHideOverlay is false', () => {
                const backdrop = createElement();
                context.document.getElementById = jest.fn(() => backdrop);

                context.window.BaseOverlay.executeCallback(null, false, 'bd');

                expect(backdrop.remove).not.toHaveBeenCalled();
            });

            it('invokes a function callback', () => {
                const cb = jest.fn();

                context.window.BaseOverlay.executeCallback(cb, false, undefined);

                expect(cb).toHaveBeenCalled();
            });

            it('sends a message for a string callback', () => {
                context.window.BaseOverlay.executeCallback('some-message', false, undefined);

                expect(context.window.vscodeApi.postMessage).toHaveBeenCalledWith({ type: 'some-message' });
            });

            it('does nothing when no callback is provided', () => {
                expect(() => context.window.BaseOverlay.executeCallback(null, false, undefined)).not.toThrow();
            });
        });
    });
});
