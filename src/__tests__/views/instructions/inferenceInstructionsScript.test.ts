/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('Inference instructions webview script', () => {
    function createElement(overrides: Partial<Record<string, any>> = {}) {
        return {
            addEventListener: jest.fn(),
            getAttribute: jest.fn(() => null),
            classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
            textContent: 'Copy',
            disabled: true,
            title: '',
            ...overrides
        };
    }

    function loadScript() {
        const docListeners: Record<string, ((...args: any[]) => void)[]> = {};
        const winListeners: Record<string, ((...args: any[]) => void)[]> = {};
        const elements: Record<string, any> = {
            connectBtn: createElement({ getAttribute: jest.fn(() => 'device-1') }),
            continueBtn: createElement({ getAttribute: jest.fn(() => 'device-1') }),
            backBtn: createElement()
        };
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: any[]) => void) => {
                (docListeners[eventName] ||= []).push(listener);
            }),
            getElementById: jest.fn((id: string) => elements[id] ?? null)
        };
        const windowMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: any[]) => void) => {
                (winListeners[eventName] ||= []).push(listener);
            })
        };
        const postMessage = jest.fn();
        const context: any = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage })),
            document: documentMock,
            window: windowMock,
            navigator: { clipboard: { writeText: jest.fn() } },
            console: { error: jest.fn(), log: jest.fn() },
            setTimeout: jest.fn()
        };

        const scriptPath = path.resolve(process.cwd(), 'src/views/instructions/inference/inferenceInstructions.js');
        const script = fs.readFileSync(scriptPath, 'utf8');
        vm.runInNewContext(script, context);

        return { context, documentMock, windowMock, elements, docListeners, winListeners, postMessage };
    }

    it('registers click listeners and requests zgx-python-env status on DOMContentLoaded', () => {
        const { elements, docListeners, postMessage } = loadScript();

        docListeners['DOMContentLoaded'][0]();

        expect(elements.connectBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(elements.continueBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(elements.backBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(elements.continueBtn.classList.add).toHaveBeenCalledWith('loading');
        expect(postMessage).toHaveBeenCalledWith({ type: 'check-zgx-python-env', deviceId: 'device-1' });
    });

    it('does not throw when connect/continue/back buttons are absent', () => {
        const { documentMock, docListeners, postMessage } = loadScript();
        documentMock.getElementById.mockReturnValue(null);

        expect(() => docListeners['DOMContentLoaded'][0]()).not.toThrow();
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('posts a connect-device message using the button data-id', () => {
        const { elements, docListeners, postMessage } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const clickHandler = elements.connectBtn.addEventListener.mock.calls[0][1];

        clickHandler();

        expect(postMessage).toHaveBeenCalledWith({ type: 'connect-device', id: 'device-1', newWindow: true });
    });

    it('logs an error and posts nothing when connect button has no device id', () => {
        const { context, elements, docListeners, postMessage } = loadScript();
        elements.connectBtn.getAttribute.mockReturnValue(null);
        docListeners['DOMContentLoaded'][0]();
        const clickHandler = elements.connectBtn.addEventListener.mock.calls[0][1];
        postMessage.mockClear(); // clear the check-zgx-python-env request fired during setup

        clickHandler();

        expect(context.console.error).toHaveBeenCalledWith('No device ID found');
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('posts a navigate message when the back button is clicked', () => {
        const { elements, docListeners, postMessage } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const clickHandler = elements.backBtn.addEventListener.mock.calls[0][1];

        clickHandler();

        expect(postMessage).toHaveBeenCalledWith({ type: 'navigate', targetView: 'devices/manager' });
    });

    it('posts a continue-to-finetuning message when the continue button is enabled', () => {
        const { elements, docListeners, postMessage } = loadScript();
        elements.continueBtn.disabled = false;
        docListeners['DOMContentLoaded'][0]();
        const clickHandler = elements.continueBtn.addEventListener.mock.calls[0][1];
        postMessage.mockClear();

        clickHandler();

        expect(postMessage).toHaveBeenCalledWith({ type: 'continue-to-finetuning', deviceId: 'device-1' });
    });

    it('does not post continue-to-finetuning when the continue button is still disabled', () => {
        const { elements, docListeners, postMessage } = loadScript();
        elements.continueBtn.disabled = true;
        docListeners['DOMContentLoaded'][0]();
        const clickHandler = elements.continueBtn.addEventListener.mock.calls[0][1];
        postMessage.mockClear();

        clickHandler();

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('enables the continue button when zgx-python-env is installed', () => {
        const { elements, winListeners } = loadScript();
        const messageHandler = winListeners['message'][0];

        messageHandler({ data: { type: 'zgx-python-env-status', isInstalled: true } });

        expect(elements.continueBtn.classList.remove).toHaveBeenCalledWith('loading');
        expect(elements.continueBtn.disabled).toBe(false);
        expect(elements.continueBtn.title).toBe('Continue to Fine-Tuning Instructions');
    });

    it('keeps the continue button disabled when zgx-python-env is not installed', () => {
        const { elements, winListeners } = loadScript();
        const messageHandler = winListeners['message'][0];

        messageHandler({ data: { type: 'zgx-python-env-status', isInstalled: false } });

        expect(elements.continueBtn.classList.remove).toHaveBeenCalledWith('loading');
        expect(elements.continueBtn.disabled).toBe(true);
        expect(elements.continueBtn.title).toBe('Fine-Tuning requires the ZGX Python Environment to be installed');
    });

    it('ignores unrelated message types', () => {
        const { elements, winListeners } = loadScript();
        const messageHandler = winListeners['message'][0];

        messageHandler({ data: { type: 'some-other-message' } });

        expect(elements.continueBtn.classList.remove).not.toHaveBeenCalled();
    });

    it('does not throw when the continue button is absent when the status message arrives', () => {
        const { documentMock, winListeners } = loadScript();
        documentMock.getElementById.mockReturnValue(null);
        const messageHandler = winListeners['message'][0];

        expect(() => messageHandler({ data: { type: 'zgx-python-env-status', isInstalled: true } })).not.toThrow();
    });

    it('copies command text to clipboard and restores the label after the timeout fires', () => {
        const { context, docListeners } = loadScript();
        const target = {
            classList: { contains: jest.fn(() => true) },
            getAttribute: jest.fn(() => 'echo hi'),
            textContent: 'Copy'
        };

        docListeners['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith('echo hi');
        expect(target.textContent).toBe('Copied!');

        const timeoutCallback = context.setTimeout.mock.calls[0][0];
        timeoutCallback();

        expect(target.textContent).toBe('Copy');
    });

    it('ignores clicks on elements without the copy-button class', () => {
        const { context, docListeners } = loadScript();
        const target = { classList: { contains: jest.fn(() => false) }, getAttribute: jest.fn() };

        docListeners['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
});
