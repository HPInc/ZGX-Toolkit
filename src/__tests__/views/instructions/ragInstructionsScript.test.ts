/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('RAG instructions webview script', () => {
    function loadScript() {
        const docListeners: Record<string, ((...args: any[]) => void)[]> = {};
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: any[]) => void) => {
                (docListeners[eventName] ||= []).push(listener);
            })
        };
        const context: any = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock,
            window: { addEventListener: jest.fn() },
            navigator: { clipboard: { writeText: jest.fn() } },
            setTimeout: jest.fn()
        };

        const scriptPath = path.resolve(process.cwd(), 'src/views/instructions/rag/ragInstructions.js');
        const script = fs.readFileSync(scriptPath, 'utf8');
        vm.runInNewContext(script, context);

        return { context, documentMock, docListeners };
    }

    it('does not register the click handler before DOMContentLoaded fires', () => {
        const { docListeners } = loadScript();

        expect(docListeners['click']).toBeUndefined();
    });

    it('registers a click handler once DOMContentLoaded fires', () => {
        const { docListeners } = loadScript();

        docListeners['DOMContentLoaded'][0]();

        expect(docListeners['click']).toHaveLength(1);
    });

    it('copies command text to clipboard and restores the label after the timeout fires', () => {
        const { context, docListeners } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const target = {
            classList: { contains: jest.fn(() => true) },
            getAttribute: jest.fn(() => 'streamlit run rag.py'),
            textContent: 'Copy'
        };

        docListeners['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith('streamlit run rag.py');
        expect(target.textContent).toBe('Copied!');

        const timeoutCallback = context.setTimeout.mock.calls[0][0];
        timeoutCallback();

        expect(target.textContent).toBe('Copy');
    });

    it('falls back to "Copy" when the original label was empty', () => {
        const { context, docListeners } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const target = {
            classList: { contains: jest.fn(() => true) },
            getAttribute: jest.fn(() => 'streamlit run rag.py'),
            textContent: ''
        };

        docListeners['click'][0]({ target });
        const timeoutCallback = context.setTimeout.mock.calls[0][0];
        timeoutCallback();

        expect(target.textContent).toBe('Copy');
    });

    it('ignores clicks on elements without the copy-button class', () => {
        const { context, docListeners } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const target = { classList: { contains: jest.fn(() => false) }, getAttribute: jest.fn() };

        docListeners['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('ignores clicks when the target has no classList', () => {
        const { context, docListeners } = loadScript();
        docListeners['DOMContentLoaded'][0]();

        expect(() => docListeners['click'][0]({ target: {} })).not.toThrow();
        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('ignores copy-button clicks with no data-copy attribute', () => {
        const { context, docListeners } = loadScript();
        docListeners['DOMContentLoaded'][0]();
        const target = { classList: { contains: jest.fn(() => true) }, getAttribute: jest.fn(() => null) };

        docListeners['click'][0]({ target });

        expect(context.navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
});
