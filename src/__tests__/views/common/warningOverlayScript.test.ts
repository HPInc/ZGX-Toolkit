/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/warningOverlay/warningOverlay.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createElement(overrides: Record<string, unknown> = {}) {
    return {
        textContent: '',
        innerHTML: '',
        style: {} as Record<string, string>,
        addEventListener: jest.fn(),
        querySelector: jest.fn(() => null),
        ...overrides
    };
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

describe('Warning overlay webview script', () => {
    it('throws when BaseOverlay has not been loaded first', () => {
        const context: any = { window: {}, document: { getElementById: jest.fn(() => null) }, console: { error: jest.fn() } };

        expect(() => loadScript(context)).toThrow('BaseOverlay is required for warning overlay functionality.');
        expect(context.console.error).toHaveBeenCalled();
    });

    it('renders the title, formatted message (bold/italic/escaping) and bullet list', () => {
        const context = createContext();
        loadScript(context);

        context.window.showWarningOverlay('Careful', 'This is **bold** and *italic* & <danger>\n- one\n- two', {
            continueText: 'Yes',
            cancelText: 'No'
        });

        const { config } = context.showCalls[0];
        const titleEl = createElement();
        const messageEl = createElement();
        const continueBtnEl = createElement();
        const cancelBtnEl = createElement();
        const overlayContent = createOverlayContent({
            '#warning-overlay-title': titleEl,
            '#warning-overlay-message': messageEl,
            '#warning-overlay-continue-btn': continueBtnEl,
            '#warning-overlay-cancel-btn': cancelBtnEl
        });

        config.onSetupContent(overlayContent);

        expect(titleEl.textContent).toBe('Careful');
        expect(messageEl.innerHTML).toContain('<strong>bold</strong>');
        expect(messageEl.innerHTML).toContain('<em>italic</em>');
        expect(messageEl.innerHTML).toContain('&amp;');
        expect(messageEl.innerHTML).toContain('&lt;danger&gt;');
        expect(messageEl.innerHTML).toContain('<ul><li>one</li><li>two</li></ul>');
        expect(continueBtnEl.textContent).toBe('Yes');
        expect(cancelBtnEl.textContent).toBe('No');
    });

    it('renders blank lines as <br> and leaves button text unchanged when not provided', () => {
        const context = createContext();
        loadScript(context);

        context.window.showWarningOverlay('T', 'Line one\n\nLine two');

        const { config } = context.showCalls[0];
        const messageEl = createElement();
        const continueBtnEl = createElement({ textContent: 'Continue' });
        const cancelBtnEl = createElement({ textContent: 'Cancel' });
        const overlayContent = createOverlayContent({
            '#warning-overlay-message': messageEl,
            '#warning-overlay-continue-btn': continueBtnEl,
            '#warning-overlay-cancel-btn': cancelBtnEl
        });

        config.onSetupContent(overlayContent);

        expect(messageEl.innerHTML).toContain('<br>');
        expect(continueBtnEl.textContent).toBe('Continue');
        expect(cancelBtnEl.textContent).toBe('Cancel');
    });

    it('applies listIndent and firstLineFontSize options', () => {
        const context = createContext();
        loadScript(context);

        context.window.showWarningOverlay('T', 'First\n- a', {
            listIndent: '20px',
            firstLineFontSize: '18px'
        });

        const { config } = context.showCalls[0];
        const ulEl = createElement();
        const pEl = createElement();
        const messageEl = createElement({
            querySelector: jest.fn((selector: string) => {
                if (selector === 'ul') return ulEl;
                if (selector === 'p') return pEl;
                return null;
            })
        });
        const overlayContent = createOverlayContent({ '#warning-overlay-message': messageEl });

        config.onSetupContent(overlayContent);

        expect(ulEl.style.paddingLeft).toBe('20px');
        expect(pEl.style.fontSize).toBe('18px');
    });

    it('sets the icon color when iconColor is provided', () => {
        const context = createContext();
        loadScript(context);

        context.window.showWarningOverlay('T', 'M', { iconColor: 'red' });

        const { config } = context.showCalls[0];
        const iconEl = createElement();
        const messageEl = createElement();
        const overlayContent = createOverlayContent({
            '.warning-overlay-icon': iconEl,
            '#warning-overlay-message': messageEl
        });

        config.onSetupContent(overlayContent);

        expect(iconEl.style.color).toBe('red');
    });

    it('hides the message container styling when hideMessageContainer is set', () => {
        const context = createContext();
        loadScript(context);

        context.window.showWarningOverlay('T', 'M', { hideMessageContainer: true });

        const { config } = context.showCalls[0];
        const containerEl = createElement();
        const msgIconEl = createElement();
        const messageEl = createElement();
        const overlayContent = createOverlayContent({
            '.warning-overlay-message-container': containerEl,
            '.warning-overlay-message-icon': msgIconEl,
            '#warning-overlay-message': messageEl
        });

        config.onSetupContent(overlayContent);

        expect(containerEl.style.background).toBe('none');
        expect(containerEl.style.padding).toBe('0');
        expect(containerEl.style.borderRadius).toBe('0');
        expect(containerEl.style.display).toBe('block');
        expect(msgIconEl.style.display).toBe('none');
    });

    it('colors matching words using a text-node walk', () => {
        const context = createContext();
        loadScript(context);
        (context as any).NodeFilter = { SHOW_TEXT: 4 };

        const textNode = { textContent: 'Danger ahead', parentNode: { replaceChild: jest.fn() } };
        const walker = {
            index: -1,
            get currentNode() {
                return textNode;
            },
            nextNode: jest.fn(function (this: any) {
                this.index += 1;
                return this.index === 0;
            })
        };
        context.document.createTreeWalker = jest.fn(() => walker);
        context.document.createDocumentFragment = jest.fn(() => ({ appendChild: jest.fn() }));
        context.document.createElement = jest.fn(() => ({ style: {}, textContent: '' }));
        context.document.createTextNode = jest.fn((text: string) => ({ textContent: text }));

        context.window.showWarningOverlay('T', 'M', { colorWords: [{ word: 'Danger', color: 'orange' }] });

        const { config } = context.showCalls[0];
        const messageEl = createElement();
        const overlayContent = createOverlayContent({ '#warning-overlay-message': messageEl });

        config.onSetupContent(overlayContent);

        expect(context.document.createTreeWalker).toHaveBeenCalledWith(messageEl, 4, null, false);
        expect(textNode.parentNode.replaceChild).toHaveBeenCalled();
    });

    it('posts a message for a string continue callback and hides the overlay, including backdrop click handling', () => {
        const context = createContext();
        loadScript(context);
        context.window.showWarningOverlay('T', 'M', { onContinue: 'continue-msg', onCancel: 'cancel-msg' });

        const { config } = context.showCalls[0];
        const backdrop = createElement();
        const continueBtn = createElement();
        const cancelBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => {
            switch (id) {
                case 'warning-overlay-backdrop': return backdrop;
                case 'warning-overlay-continue-btn': return continueBtn;
                case 'warning-overlay-cancel-btn': return cancelBtn;
                default: return null;
            }
        });

        config.onAttachEvents();

        expect(cancelBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        const continueHandler = continueBtn.addEventListener.mock.calls[0][1];
        continueHandler();
        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('warning-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'continue-msg' });

        const backdropClick = backdrop.addEventListener.mock.calls.find((c: any) => c[0] === 'click')[1];
        const evt = {};
        backdropClick(evt);
        expect(context.window.BaseOverlay.preventBackdropClick).toHaveBeenCalledWith(evt, 'warning-overlay-backdrop');
        expect(backdrop.addEventListener).toHaveBeenCalledWith('mousedown', context.window.BaseOverlay.stopEventPropagation);
    });

    it('posts a message for a string cancel callback and hides the overlay', () => {
        const context = createContext();
        loadScript(context);
        context.window.showWarningOverlay('T', 'M', { onCancel: 'cancel-msg' });

        const { config } = context.showCalls[0];
        const cancelBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'warning-overlay-cancel-btn' ? cancelBtn : null));

        config.onAttachEvents();
        cancelBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('warning-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'cancel-msg' });
    });

    it('invokes a function continue callback', () => {
        const onContinue = jest.fn();
        const context = createContext();
        loadScript(context);
        context.window.showWarningOverlay('T', 'M', { onContinue });

        const { config } = context.showCalls[0];
        const continueBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'warning-overlay-continue-btn' ? continueBtn : null));

        config.onAttachEvents();
        continueBtn.addEventListener.mock.calls[0][1]();

        expect(onContinue).toHaveBeenCalled();
    });

    it('invokes a function cancel callback', () => {
        const onCancel = jest.fn();
        const context = createContext();
        loadScript(context);
        context.window.showWarningOverlay('T', 'M', { onCancel });

        const { config } = context.showCalls[0];
        const cancelBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'warning-overlay-cancel-btn' ? cancelBtn : null));

        config.onAttachEvents();
        cancelBtn.addEventListener.mock.calls[0][1]();

        expect(onCancel).toHaveBeenCalled();
    });

    it('does not throw when no callbacks or DOM elements are present', () => {
        const context = createContext();
        loadScript(context);
        context.window.showWarningOverlay('T', 'M');

        const { config } = context.showCalls[0];
        context.document.getElementById = jest.fn(() => null);

        expect(() => config.onAttachEvents()).not.toThrow();
    });

    it('hideWarningOverlay hides the backdrop', () => {
        const context = createContext();
        loadScript(context);

        context.window.hideWarningOverlay();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('warning-overlay-backdrop');
    });
});
