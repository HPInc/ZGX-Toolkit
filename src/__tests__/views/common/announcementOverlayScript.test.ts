/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/announcementOverlay/announcementOverlay.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createElement(overrides: Record<string, unknown> = {}) {
    return {
        textContent: '',
        innerHTML: '',
        style: {} as Record<string, string>,
        className: '',
        classList: { add: jest.fn(), remove: jest.fn() },
        addEventListener: jest.fn(),
        src: '',
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

describe('Announcement overlay webview script', () => {
    it('throws when BaseOverlay has not been loaded first', () => {
        const context: any = { window: {}, document: { getElementById: jest.fn(() => null) }, console: { error: jest.fn() } };

        expect(() => loadScript(context)).toThrow('BaseOverlay is required for announcement overlay functionality.');
        expect(context.console.error).toHaveBeenCalled();
    });

    it('renders title, custom icon, and formatted message with bullet/numbered lists and a note', () => {
        const context = createContext();
        loadScript(context);

        context.window.showAnnouncementOverlay(
            'New feature',
            'Intro **bold** *italic*\n- bullet one\n- bullet two\n1. step one\n2. step two\n> A helpful note',
            { icon: 'codicon-rocket', dismissText: 'Got it', learnMoreText: 'Details', onLearnMore: jest.fn() }
        );

        const { config } = context.showCalls[0];
        const titleEl = createElement();
        const messageEl = createElement();
        const dismissBtnEl = createElement();
        const learnMoreBtnEl = createElement();
        const iconEl = createElement();
        const overlayContent = createOverlayContent({
            '#announcement-overlay-title': titleEl,
            '#announcement-overlay-message': messageEl,
            '#announcement-overlay-dismiss-btn': dismissBtnEl,
            '#announcement-overlay-learn-more-btn': learnMoreBtnEl,
            '.announcement-overlay-icon': iconEl
        });

        config.onSetupContent(overlayContent);

        expect(titleEl.textContent).toBe('New feature');
        expect(iconEl.className).toBe('codicon codicon-rocket overlay-icon announcement-overlay-icon');
        expect(messageEl.innerHTML).toContain('<strong>bold</strong>');
        expect(messageEl.innerHTML).toContain('<em>italic</em>');
        expect(messageEl.innerHTML).toContain('<ul><li>bullet one</li><li>bullet two</li></ul>');
        expect(messageEl.innerHTML).toContain('<ol><li>step one</li><li>step two</li></ol>');
        expect(messageEl.innerHTML).toContain('announcement-overlay-note');
        expect(messageEl.innerHTML).toContain('A helpful note');
        expect(dismissBtnEl.textContent).toBe('Got it');
        expect(learnMoreBtnEl.textContent).toBe('Details');
    });

    it('uses a custom image icon when iconImageUri is provided', () => {
        const context = createContext();
        loadScript(context);

        context.window.showAnnouncementOverlay('T', 'M', { iconImageUri: 'https://example.com/logo.png' });

        const { config } = context.showCalls[0];
        const iconEl = createElement();
        const iconImgEl = createElement();
        const messageEl = createElement();
        const dismissBtnEl = createElement();
        const overlayContent = createOverlayContent({
            '.announcement-overlay-icon': iconEl,
            '#announcement-overlay-icon-img': iconImgEl,
            '#announcement-overlay-message': messageEl,
            '#announcement-overlay-dismiss-btn': dismissBtnEl
        });

        config.onSetupContent(overlayContent);

        expect(iconImgEl.src).toBe('https://example.com/logo.png');
        expect(iconImgEl.classList.remove).toHaveBeenCalledWith('hidden');
        expect(iconEl.style.display).toBe('none');
    });

    it('renders blank lines as <br>, applies default button text, and hides Learn More without a handler', () => {
        const context = createContext();
        loadScript(context);

        context.window.showAnnouncementOverlay('T', 'Line one\n\nLine two');

        const { config } = context.showCalls[0];
        const messageEl = createElement();
        const dismissBtnEl = createElement();
        const learnMoreBtnEl = createElement();
        const overlayContent = createOverlayContent({
            '#announcement-overlay-message': messageEl,
            '#announcement-overlay-dismiss-btn': dismissBtnEl,
            '#announcement-overlay-learn-more-btn': learnMoreBtnEl
        });

        config.onSetupContent(overlayContent);

        expect(messageEl.innerHTML).toContain('<br>');
        expect(dismissBtnEl.textContent).toBe('Dismiss');
        expect(learnMoreBtnEl.textContent).toBe('Learn More');
        expect(learnMoreBtnEl.style.display).toBe('none');
    });

    it('styles Learn More as primary when learnMoreIsPrimary is set', () => {
        const context = createContext();
        loadScript(context);

        context.window.showAnnouncementOverlay('T', 'M', { onLearnMore: jest.fn(), learnMoreIsPrimary: true });

        const { config } = context.showCalls[0];
        const learnMoreBtnEl = createElement();
        const dismissBtnEl = createElement();
        const messageEl = createElement();
        const overlayContent = createOverlayContent({
            '#announcement-overlay-learn-more-btn': learnMoreBtnEl,
            '#announcement-overlay-dismiss-btn': dismissBtnEl,
            '#announcement-overlay-message': messageEl
        });

        config.onSetupContent(overlayContent);

        expect(learnMoreBtnEl.classList.remove).toHaveBeenCalledWith('overlay-btn-secondary');
        expect(learnMoreBtnEl.classList.add).toHaveBeenCalledWith('overlay-btn-primary');
    });

    it('posts a message for a string dismiss callback and hides the overlay, including backdrop click handling', () => {
        const context = createContext();
        loadScript(context);
        context.window.showAnnouncementOverlay('T', 'M', { onDismiss: 'dismiss-msg', onLearnMore: 'learn-more-msg' });

        const { config } = context.showCalls[0];
        const backdrop = createElement();
        const dismissBtn = createElement();
        const learnMoreBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => {
            switch (id) {
                case 'announcement-overlay-backdrop': return backdrop;
                case 'announcement-overlay-dismiss-btn': return dismissBtn;
                case 'announcement-overlay-learn-more-btn': return learnMoreBtn;
                default: return null;
            }
        });

        config.onAttachEvents();

        expect(learnMoreBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        dismissBtn.addEventListener.mock.calls[0][1]();
        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('announcement-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'dismiss-msg' });

        const backdropClick = backdrop.addEventListener.mock.calls.find((c: any) => c[0] === 'click')[1];
        const evt = {};
        backdropClick(evt);
        expect(context.window.BaseOverlay.preventBackdropClick).toHaveBeenCalledWith(evt, 'announcement-overlay-backdrop');
        expect(backdrop.addEventListener).toHaveBeenCalledWith('touchend', context.window.BaseOverlay.stopEventPropagation);
    });

    it('posts a message for a string learn-more callback and hides the overlay', () => {
        const context = createContext();
        loadScript(context);
        context.window.showAnnouncementOverlay('T', 'M', { onLearnMore: 'learn-more-msg' });

        const { config } = context.showCalls[0];
        const learnMoreBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'announcement-overlay-learn-more-btn' ? learnMoreBtn : null));

        config.onAttachEvents();
        learnMoreBtn.addEventListener.mock.calls[0][1]();

        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('announcement-overlay-backdrop');
        expect(context.postMessage).toHaveBeenCalledWith({ type: 'learn-more-msg' });
    });

    it('invokes a function dismiss callback', () => {
        const onDismiss = jest.fn();
        const context = createContext();
        loadScript(context);
        context.window.showAnnouncementOverlay('T', 'M', { onDismiss });

        const { config } = context.showCalls[0];
        const dismissBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'announcement-overlay-dismiss-btn' ? dismissBtn : null));

        config.onAttachEvents();
        dismissBtn.addEventListener.mock.calls[0][1]();

        expect(onDismiss).toHaveBeenCalled();
    });

    it('invokes a function learn-more callback', () => {
        const onLearnMore = jest.fn();
        const context = createContext();
        loadScript(context);
        context.window.showAnnouncementOverlay('T', 'M', { onLearnMore });

        const { config } = context.showCalls[0];
        const learnMoreBtn = createElement();
        context.document.getElementById = jest.fn((id: string) => (id === 'announcement-overlay-learn-more-btn' ? learnMoreBtn : null));

        config.onAttachEvents();
        learnMoreBtn.addEventListener.mock.calls[0][1]();

        expect(onLearnMore).toHaveBeenCalled();
    });

    it('does not throw when no callbacks or DOM elements are present', () => {
        const context = createContext();
        loadScript(context);
        context.window.showAnnouncementOverlay('T', 'M');

        const { config } = context.showCalls[0];
        context.document.getElementById = jest.fn(() => null);

        expect(() => config.onAttachEvents()).not.toThrow();
    });
});
