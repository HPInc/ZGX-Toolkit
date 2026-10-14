/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const scripts = ['apps/progress/appProgress', 'setup/dnsRegistration/dnsRegistration'];
const troubleshootingUrl = 'https://github.com/HPInc/ZGX-Toolkit/wiki/SSH-Host-Key-Troubleshooting';

function loadScript(script: string) {
    const classes = new Set(['hidden']);
    const elements = Object.fromEntries([
        'progress-fill', 'progress-text', 'password-section', 'password-input', 'password-submit-btn',
        'password-feedback', 'host-trust-actions', 'host-trust-return-btn', 'status-text', 'status-container'
    ].map(identifier => [identifier, {
        value: '', disabled: false, textContent: '', innerHTML: '', className: '',
        focus: jest.fn(), addEventListener: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn((value: string) => classes.delete(value)) }
    }]));
    const documentListeners: Record<string, (...args: any[]) => void> = {};
    const windowListeners: Record<string, (...args: any[]) => void> = {};
    const sentMessages: Record<string, unknown>[] = [];
    const context = {
        document: {
            getElementById: (identifier: string) => elements[identifier],
            addEventListener: (event: string, callback: (...args: any[]) => void) => { documentListeners[event] = callback; }
        },
        window: {
            addEventListener: (event: string, callback: (...args: any[]) => void) => { windowListeners[event] = callback; }
        },
        acquireVsCodeApi: () => ({ postMessage: (message: Record<string, unknown>) => { sentMessages.push({ ...message }); } }),
        setTimeout: jest.fn()
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(process.cwd(), `src/views/${script}.js`), 'utf8'), context);
    documentListeners.DOMContentLoaded();

    const dispatch = (message: Record<string, unknown>) => windowListeners.message({ data: message });
    const click = (identifier: string) => {
        const callback = elements[identifier].addEventListener.mock.calls.find(call => call[0] === 'click')?.[1];
        (callback as () => void)();
    };
    const pressEnter = () => {
        const callback = elements['password-input'].addEventListener.mock.calls.find(call => call[0] === 'keypress')?.[1];
        (callback as (event: { key: string }) => void)({ key: 'Enter' });
    };
    return { elements, sentMessages, dispatch, click, pressEnter };
}

describe.each(scripts)('SSH trust feedback in %s', script => {
    it('shows the detailed warning, clears the secret, and disables password retries', () => {
        const { elements, dispatch, click, pressEnter, sentMessages } = loadScript(script);
        elements['password-input'].value = 'synthetic-password';
        click('password-submit-btn');
        const error = 'Device identity could not be verified. No password was sent.\n\nSHA256:test-fingerprint';

        dispatch({ type: 'passwordValidationResult', valid: false, hostVerificationFailed: true, error });

        expect(elements['password-feedback'].textContent).toBe(error);
        expect(elements['password-input'].value).toBe('');
        expect(elements['password-input'].disabled).toBe(true);
        expect(elements['password-submit-btn'].disabled).toBe(true);
        expect(elements['host-trust-actions'].classList.remove).toHaveBeenCalledWith('hidden');
        elements['password-input'].value = 'another-password';
        click('password-submit-btn');
        pressEnter();
        expect(sentMessages).toEqual([{ type: 'validatePassword', password: 'synthetic-password' }]);
    });

    it('preserves ordinary password retry and backend error text', () => {
        const { elements, dispatch, click, sentMessages } = loadScript(script);
        dispatch({ type: 'passwordValidationResult', valid: false, error: 'Incorrect password. Please try again.' });
        expect(elements['password-feedback'].textContent).toBe('Incorrect password. Please try again.');
        expect(elements['password-input'].disabled).toBe(false);
        expect(elements['password-submit-btn'].disabled).toBe(false);
        expect(elements['host-trust-actions'].classList.remove).not.toHaveBeenCalled();

        elements['password-input'].value = 'synthetic-retry';
        click('password-submit-btn');
        expect(sentMessages).toEqual([{ type: 'validatePassword', password: 'synthetic-retry' }]);
    });

    it('returns through the controller using the existing cancel message', () => {
        const { click, sentMessages } = loadScript(script);
        click('host-trust-return-btn');
        expect(sentMessages).toEqual([{ type: 'cancel' }]);
    });

    it('includes a safe external troubleshooting link without interpolating server data', () => {
        const html = fs.readFileSync(path.resolve(process.cwd(), `src/views/${script}.html`), 'utf8');
        expect(html).toContain(`href="${troubleshootingUrl}" target="_blank" rel="noopener noreferrer"`);
        expect(html).toContain('id="host-trust-actions" class="hidden"');
        expect(html).toContain('role="alert"');
    });
});