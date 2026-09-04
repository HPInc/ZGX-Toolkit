/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/error/error.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createButton() {
    return { addEventListener: jest.fn() };
}

describe('Error view webview script', () => {
    it('wires up the retry and back buttons and posts the expected messages', () => {
        const retryBtn = createButton();
        const backBtn = createButton();
        const postMessage = jest.fn();
        const documentMock = {
            getElementById: jest.fn((id: string) => {
                if (id === 'retry-btn') return retryBtn;
                if (id === 'back-btn') return backBtn;
                return null;
            })
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage })),
            document: documentMock
        };

        loadScript(context);

        expect(retryBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(backBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        const retryHandler = retryBtn.addEventListener.mock.calls[0][1];
        retryHandler();
        expect(postMessage).toHaveBeenCalledWith({ type: 'retry' });

        const backHandler = backBtn.addEventListener.mock.calls[0][1];
        backHandler();
        expect(postMessage).toHaveBeenCalledWith({ type: 'navigate-back' });
    });

    it('does nothing when neither button is present', () => {
        const documentMock = {
            getElementById: jest.fn(() => null)
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock
        };

        expect(() => loadScript(context)).not.toThrow();
        expect(documentMock.getElementById).toHaveBeenCalledWith('retry-btn');
        expect(documentMock.getElementById).toHaveBeenCalledWith('back-btn');
    });
});
