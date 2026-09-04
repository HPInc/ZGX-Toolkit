/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('Fine-tuning instructions webview script', () => {
    function createElement(overrides: Partial<Record<string, any>> = {}) {
        return {
            addEventListener: jest.fn(),
            getAttribute: jest.fn(() => null),
            classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
            textContent: 'Copy',
            ...overrides
        };
    }

    function loadScript() {
        const listenersByEvent: Record<string, ((...args: any[]) => void)[]> = {};
        const elements: Record<string, any> = {
            connectBtn: createElement({ getAttribute: jest.fn(() => 'device-1') }),
            backBtn: createElement()
        };
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: any[]) => void) => {
                (listenersByEvent[eventName] ||= []).push(listener);
            }),
            getElementById: jest.fn((id: string) => elements[id] ?? null)
        };
        const postMessage = jest.fn();
        const context: any = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage })),
            document: documentMock,
            window: { addEventListener: jest.fn() },
            navigator: { clipboard: { writeText: jest.fn() } },
            console: { error: jest.fn(), log: jest.fn() },
            setTimeout: jest.fn()
        };

        const scriptPath = path.resolve(process.cwd(), 'src/views/instructions/finetuning/fineTuningInstructions.js');
        const script = fs.readFileSync(scriptPath, 'utf8');
        vm.runInNewContext(script, context);

        return { context, documentMock, elements, listenersByEvent, postMessage };
    }

    it('registers click listeners for connect and back buttons on DOMContentLoaded', () => {
        const { elements, listenersByEvent } = loadScript();

        listenersByEvent['DOMContentLoaded'][0]();

        expect(elements.connectBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(elements.backBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('does not throw when connect/back buttons are absent', () => {
        const { documentMock, listenersByEvent } = loadScript();
        documentMock.getElementById.mockReturnValue(null);

        expect(() => listenersByEvent['DOMContentLoaded'][0]()).not.toThrow();
    });

    it('posts a connect-device message using the button data-id', () => {
        const { elements, listenersByEvent, postMessage } = loadScript();
        listenersByEvent['DOMContentLoaded'][0]();
        const clickHandler = elements.connectBtn.addEventListener.mock.calls[0][1];

        clickHandler();

        expect(postMessage).toHaveBeenCalledWith({ type: 'connect-device', id: 'device-1', newWindow: true });
    });

    it('logs an error and posts nothing when connect button has no device id', () => {
        const { context, elements, listenersByEvent, postMessage } = loadScript();
        elements.connectBtn.getAttribute.mockReturnValue(null);
        listenersByEvent['DOMContentLoaded'][0]();
        const clickHandler = elements.connectBtn.addEventListener.mock.calls[0][1];

        clickHandler();

        expect(context.console.error).toHaveBeenCalledWith('No device ID found');
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('posts a navigate message when the back button is clicked', () => {
        const { elements, listenersByEvent, postMessage } = loadScript();
        listenersByEvent['DOMContentLoaded'][0]();
        const clickHandler = elements.backBtn.addEventListener.mock.calls[0][1];

        clickHandler();

        expect(postMessage).toHaveBeenCalledWith({
            type: 'navigate',
            targetView: 'devices/manager',
            params: { deviceId: '{{deviceId}}' }
        });
    });

    it('copies command text to clipboard and restores the label after the timeout fires', () => {
        const { context, listenersByEvent } = loadScript();
        const target = {
            classList: { contains: jest.fn(() => true) },
            getAttribute: jest.fn(() => 'echo hi'),
            textContent: 'Copy'
        };

        listenersByEvent['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith('echo hi');
        expect(target.textContent).toBe('Copied!');
        expect(context.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

        const timeoutCallback = context.setTimeout.mock.calls[0][0];
        timeoutCallback();

        expect(target.textContent).toBe('Copy');
    });

    it('falls back to "Copy" when the original label was empty', () => {
        const { context, listenersByEvent } = loadScript();
        const target = {
            classList: { contains: jest.fn(() => true) },
            getAttribute: jest.fn(() => 'echo hi'),
            textContent: ''
        };

        listenersByEvent['click'][0]({ target });
        const timeoutCallback = context.setTimeout.mock.calls[0][0];
        timeoutCallback();

        expect(target.textContent).toBe('Copy');
    });

    it('ignores clicks on elements without the copy-button class', () => {
        const { context, listenersByEvent } = loadScript();
        const target = { classList: { contains: jest.fn(() => false) }, getAttribute: jest.fn() };

        listenersByEvent['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('ignores clicks when the target has no classList', () => {
        const { context, listenersByEvent } = loadScript();

        expect(() => listenersByEvent['click'][0]({ target: {} })).not.toThrow();
        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('ignores copy-button clicks with no data-copy attribute', () => {
        const { context, listenersByEvent } = loadScript();
        const target = { classList: { contains: jest.fn(() => true) }, getAttribute: jest.fn(() => null) };

        listenersByEvent['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
});
