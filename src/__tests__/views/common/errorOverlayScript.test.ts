/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/errorOverlay/errorOverlay.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createElement(overrides: Record<string, unknown> = {}) {
    return { textContent: '', innerHTML: '', style: {} as Record<string, string>, addEventListener: jest.fn(), ...overrides };
}

function createOverlayContent(elements: Record<string, any>) {
    return { querySelector: jest.fn((selector: string) => elements[selector] ?? null) };
}

function createContext() {
    const postMessage = jest.fn();
    const showCalls: { templateId: string; config: any }[] = [];
    const BaseOverlay = {
        show: jest.fn((templateId: string, config: any) => {
            showCalls.push({ templateId, config });
        }),
        hide: jest.fn(),
        preventBackdropClick: jest.fn(),
        stopEventPropagation: jest.fn(),
        sendMessage: jest.fn((msg: unknown) => postMessage(msg)),
        executeCallback: jest.fn()
    };
    return {
        window: { BaseOverlay, vscodeApi: { postMessage } },
        document: { getElementById: jest.fn((_id?: string): any => null) },
        console: { error: jest.fn() },
        showCalls,
        postMessage
    } as any;
}

describe('Error overlay webview script', () => {
    it('throws when BaseOverlay has not been loaded first', () => {
        const context: any = { window: {}, document: { getElementById: jest.fn(() => null) }, console: { error: jest.fn() } };

        expect(() => loadScript(context)).toThrow('BaseOverlay is required for error overlay functionality.');
        expect(context.console.error).toHaveBeenCalled();
    });

    it('renders full content including the details section and secondary button', () => {
        const context = createContext();
        loadScript(context);
        const secondaryOnClick = jest.fn();

        (context.window as any).showErrorOverlay('Title', 'Bad **thing** & <html>', 'stack trace', undefined, 'Close it', {
            text: 'More info',
            onClick: secondaryOnClick
        });

        expect(context.window.BaseOverlay.show).toHaveBeenCalledWith(
            'error-overlay-template',
            expect.objectContaining({ backdropId: 'error-overlay-backdrop' })
        );

        const { config } = context.showCalls[0];
        const titleEl = createElement();
        const messageEl = createElement();
        const detailsTextEl = createElement();
        const detailsEl = createElement();
        const closeBtnEl = createElement();
        const secondaryBtnEl = createElement();
        const overlayContent = createOverlayContent({
            '#error-overlay-title': titleEl,
            '#error-overlay-message': messageEl,
            '#error-overlay-details-text': detailsTextEl,
            '#error-overlay-details': detailsEl,
            '#error-overlay-close-btn': closeBtnEl,
            '#error-overlay-secondary-btn': secondaryBtnEl
        });

        config.onSetupContent(overlayContent);

        expect(titleEl.textContent).toBe('Title');
        expect(closeBtnEl.textContent).toBe('Close it');
        expect(secondaryBtnEl.textContent).toBe('More info');
        expect(secondaryBtnEl.style.display).toBe('inline-block');
        expect(messageEl.innerHTML).toContain('<strong>thing</strong>');
        expect(messageEl.innerHTML).toContain('&amp;');
        expect(messageEl.innerHTML).toContain('&lt;html&gt;');
        expect(detailsTextEl.textContent).toBe('stack trace');
        expect(detailsEl.style.display).not.toBe('none');
    });

    it('hides the details section when no error is provided', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('Title', 'details only');

        const { config } = context.showCalls[0];
        const detailsEl = createElement();
        const overlayContent = createOverlayContent({
            '#error-overlay-message': createElement(),
            '#error-overlay-details': detailsEl
        });

        config.onSetupContent(overlayContent);

        expect(detailsEl.style.display).toBe('none');
    });

    it('sends the default close message and hides the overlay when no close callback is given', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E');
        const { config } = context.showCalls[0];
        const backdrop = createElement();
        const closeBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => {
            if (id === 'error-overlay-backdrop') return backdrop;
            if (id === 'error-overlay-close-btn') return closeBtn;
            return null;
        });

        config.onAttachEvents();
        const closeHandler = closeBtn.addEventListener.mock.calls[0][1];
        closeHandler();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('error-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'close-error-overlay' });

        const backdropClickHandler = backdrop.addEventListener.mock.calls.find((c: any) => c[0] === 'click')[1];
        const evt = {};
        backdropClickHandler(evt);
        expect(context.window.BaseOverlay.preventBackdropClick).toHaveBeenCalledWith(evt, 'error-overlay-backdrop');
        expect(backdrop.addEventListener).toHaveBeenCalledWith('mousedown', context.window.BaseOverlay.stopEventPropagation);
        expect(backdrop.addEventListener).toHaveBeenCalledWith('mouseup', context.window.BaseOverlay.stopEventPropagation);
        expect(backdrop.addEventListener).toHaveBeenCalledWith('touchstart', context.window.BaseOverlay.stopEventPropagation);
        expect(backdrop.addEventListener).toHaveBeenCalledWith('touchend', context.window.BaseOverlay.stopEventPropagation);
    });

    it('invokes a function close callback and still hides the overlay', () => {
        const context = createContext();
        loadScript(context);
        const onClose = jest.fn();

        (context.window as any).showErrorOverlay('T', 'D', 'E', onClose);
        const { config } = context.showCalls[0];
        const closeBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-close-btn' ? closeBtn : null));

        config.onAttachEvents();
        closeBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('error-overlay-backdrop');
        expect(onClose).toHaveBeenCalled();
        expect(context.postMessage).not.toHaveBeenCalled();
    });

    it('does not hide the overlay for a custom string close callback but still posts it', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E', 'custom-close');
        const { config } = context.showCalls[0];
        const closeBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-close-btn' ? closeBtn : null));

        config.onAttachEvents();
        closeBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).not.toHaveBeenCalled();
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'custom-close' });
    });

    it('hides the overlay when the string close callback matches the default close message', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E', 'close-error-overlay');
        const { config } = context.showCalls[0];
        const closeBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-close-btn' ? closeBtn : null));

        config.onAttachEvents();
        closeBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('error-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'close-error-overlay' });
    });

    it('invokes a function secondary callback and hides the overlay', () => {
        const context = createContext();
        loadScript(context);
        const secondaryOnClick = jest.fn();

        (context.window as any).showErrorOverlay('T', 'D', 'E', undefined, undefined, { text: 'More', onClick: secondaryOnClick });
        const { config } = context.showCalls[0];
        const secondaryBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-secondary-btn' ? secondaryBtn : null));

        config.onAttachEvents();
        expect(secondaryBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        secondaryBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('error-overlay-backdrop');
        expect(secondaryOnClick).toHaveBeenCalled();
    });

    it('does not hide the overlay for a string secondary callback but still posts it', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E', undefined, undefined, { text: 'More', onClick: 'secondary-msg' });
        const { config } = context.showCalls[0];
        const secondaryBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-secondary-btn' ? secondaryBtn : null));

        config.onAttachEvents();
        secondaryBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).not.toHaveBeenCalled();
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'secondary-msg' });
    });

    it('does not attach a secondary button listener when no secondary callback is provided', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E');
        const { config } = context.showCalls[0];
        const secondaryBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'error-overlay-secondary-btn' ? secondaryBtn : null));

        config.onAttachEvents();

        expect(secondaryBtn.addEventListener).not.toHaveBeenCalled();
    });

    it('does not throw when the backdrop and buttons are missing from the DOM', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).showErrorOverlay('T', 'D', 'E');
        const { config } = context.showCalls[0];
        context.document.getElementById = jest.fn(() => null);

        expect(() => config.onAttachEvents()).not.toThrow();
    });

    it('hideErrorOverlay hides the backdrop and clears callbacks', () => {
        const context = createContext();
        loadScript(context);

        (context.window as any).hideErrorOverlay();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('error-overlay-backdrop');
    });
});
