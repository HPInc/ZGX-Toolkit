/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function loadScript(context: Record<string, unknown>): void {
    const scriptPath = path.resolve(process.cwd(), 'src/views/common/passwordInputOverlay/passwordInputOverlay.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
    vm.runInNewContext(script, context);
}

function createElement(overrides: Record<string, unknown> = {}) {
    return {
        textContent: '',
        style: {} as Record<string, string>,
        className: '',
        placeholder: '',
        value: '',
        focus: jest.fn(),
        addEventListener: jest.fn(),
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
        setTimeout: (cb: () => void) => cb(),
        showCalls,
        postMessage
    } as any;
}

describe('Password input overlay webview script', () => {
    it('logs an error and does not expose showPasswordInputOverlay when BaseOverlay is missing', () => {
        const context: any = { window: {}, document: { getElementById: jest.fn(() => null) }, console: { error: jest.fn() }, setTimeout: (cb: () => void) => cb() };

        loadScript(context);

        expect(context.console.error).toHaveBeenCalled();
        expect(context.window.showPasswordInputOverlay).toBeUndefined();
    });

    it('logs an error and does not show the overlay when title or message is missing', () => {
        const context = createContext();
        loadScript(context);

        context.window.showPasswordInputOverlay({ title: 'Only title' });

        expect(context.console.error).toHaveBeenCalledWith('showPasswordInputOverlay requires title and message options');
        expect(context.window.BaseOverlay.show).not.toHaveBeenCalled();
    });

    it('populates overlay content with provided options', () => {
        const context = createContext();
        loadScript(context);

        context.window.showPasswordInputOverlay({
            title: 'Enter password',
            message: 'Please authenticate',
            icon: 'codicon-key',
            fieldLabel: 'Passphrase:',
            placeholder: 'secret',
            hint: 'Use your device password',
            submitButtonText: 'Go',
            cancelButtonText: 'Nevermind',
            validationErrorMessage: 'Required!'
        });

        const { config } = context.showCalls[0];
        const iconEl = createElement();
        const titleEl = createElement();
        const messageEl = createElement();
        const labelEl = createElement();
        const fieldEl = createElement();
        const hintEl = createElement();
        const submitBtn = createElement();
        const cancelBtn = createElement();
        const overlayContent = createOverlayContent({
            '#password-input-overlay-icon': iconEl,
            '#password-input-overlay-title': titleEl,
            '#password-input-overlay-message': messageEl,
            '#password-input-overlay-label': labelEl,
            '#password-input-overlay-field': fieldEl,
            '#password-input-overlay-hint': hintEl,
            '#password-input-overlay-submit-btn': submitBtn,
            '#password-input-overlay-cancel-btn': cancelBtn
        });

        config.onSetupContent(overlayContent);

        expect(iconEl.className).toBe('codicon codicon-key overlay-icon password-input-icon');
        expect(titleEl.textContent).toBe('Enter password');
        expect(messageEl.textContent).toBe('Please authenticate');
        expect(labelEl.textContent).toBe('Passphrase:');
        expect(fieldEl.placeholder).toBe('secret');
        expect(hintEl.textContent).toBe('Use your device password');
        expect(hintEl.style.display).toBe('block');
        expect(submitBtn.textContent).toBe('Go');
        expect(cancelBtn.textContent).toBe('Nevermind');
        expect(context.window._passwordInputValidationError).toBe('Required!');
    });

    it('applies default values and hides the hint when options are not provided', () => {
        const context = createContext();
        loadScript(context);

        context.window.showPasswordInputOverlay({ title: 'T', message: 'M' });

        const { config } = context.showCalls[0];
        const iconEl = createElement();
        const fieldEl = createElement();
        const hintEl = createElement();
        const submitBtn = createElement();
        const cancelBtn = createElement();
        const overlayContent = createOverlayContent({
            '#password-input-overlay-icon': iconEl,
            '#password-input-overlay-field': fieldEl,
            '#password-input-overlay-hint': hintEl,
            '#password-input-overlay-submit-btn': submitBtn,
            '#password-input-overlay-cancel-btn': cancelBtn
        });

        config.onSetupContent(overlayContent);

        expect(iconEl.className).toBe('codicon codicon-lock overlay-icon password-input-icon');
        expect(fieldEl.placeholder).toBe('Enter password...');
        expect(hintEl.style.display).toBe('none');
        expect(submitBtn.textContent).toBe('Continue');
        expect(cancelBtn.textContent).toBe('Cancel');
        expect(context.window._passwordInputValidationError).toBe('Password is required');
    });

    it('focuses the password field and attaches all listeners', () => {
        const context = createContext();
        loadScript(context);
        context.window.showPasswordInputOverlay({ title: 'T', message: 'M' });

        const { config } = context.showCalls[0];
        const backdrop = createElement();
        const submitBtn = createElement();
        const cancelBtn = createElement();
        const passwordField = createElement();
        const errorEl = createElement();
        context.document.getElementById = jest.fn((id: string) => {
            switch (id) {
                case 'password-input-overlay-backdrop': return backdrop;
                case 'password-input-overlay-submit-btn': return submitBtn;
                case 'password-input-overlay-cancel-btn': return cancelBtn;
                case 'password-input-overlay-field': return passwordField;
                case 'password-input-overlay-error': return errorEl;
                default: return null;
            }
        });

        config.onAttachEvents();

        expect(passwordField.focus).toHaveBeenCalled();
        expect(submitBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(cancelBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(passwordField.addEventListener).toHaveBeenCalledWith('keypress', expect.any(Function));
        expect(passwordField.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
        expect(backdrop.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        const backdropClick = backdrop.addEventListener.mock.calls.find((c: any) => c[0] === 'click')[1];
        const evt = {};
        backdropClick(evt);
        expect(context.window.BaseOverlay.preventBackdropClick).toHaveBeenCalledWith(evt, 'password-input-overlay-backdrop');
    });

    it('does not throw when no overlay elements are present', () => {
        const context = createContext();
        loadScript(context);
        context.window.showPasswordInputOverlay({ title: 'T', message: 'M' });

        const { config } = context.showCalls[0];
        context.document.getElementById = jest.fn(() => null);

        expect(() => config.onAttachEvents()).not.toThrow();
    });

    describe('submit handling', () => {
        function attach(context: any) {
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M' });
            const { config } = context.showCalls[0];
            const backdrop = createElement();
            const submitBtn = createElement();
            const cancelBtn = createElement();
            const passwordField = createElement();
            const errorEl = createElement();
            context.document.getElementById = jest.fn((id: string) => {
                switch (id) {
                    case 'password-input-overlay-backdrop': return backdrop;
                    case 'password-input-overlay-submit-btn': return submitBtn;
                    case 'password-input-overlay-cancel-btn': return cancelBtn;
                    case 'password-input-overlay-field': return passwordField;
                    case 'password-input-overlay-error': return errorEl;
                    default: return null;
                }
            });
            config.onAttachEvents();
            const submitHandler = submitBtn.addEventListener.mock.calls[0][1];
            const cancelHandler = cancelBtn.addEventListener.mock.calls[0][1];
            const keypressHandler = passwordField.addEventListener.mock.calls.find((c: any) => c[0] === 'keypress')[1];
            const inputHandler = passwordField.addEventListener.mock.calls.find((c: any) => c[0] === 'input')[1];
            return { submitHandler, cancelHandler, keypressHandler, inputHandler, passwordField, errorEl };
        }

        it('shows a validation error and refocuses when the password is empty', () => {
            const context = createContext();
            loadScript(context);
            const { submitHandler, passwordField, errorEl } = attach(context);
            passwordField.value = '   ';

            submitHandler();

            expect(errorEl.textContent).toBe('Password is required');
            expect(errorEl.style.display).toBe('block');
            expect(passwordField.focus).toHaveBeenCalled();
            expect(context.window.BaseOverlay.hide).not.toHaveBeenCalled();
        });

        it('invokes a function submit callback with the password and clears the field', () => {
            const onSubmit = jest.fn();
            const context = createContext();
            loadScript(context);
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M', onSubmit });
            const { config } = context.showCalls[0];
            const passwordField = createElement({ value: 'hunter2' });
            const errorEl = createElement();
            context.document.getElementById = jest.fn((id: string) => {
                if (id === 'password-input-overlay-field') return passwordField;
                if (id === 'password-input-overlay-error') return errorEl;
                return null;
            });
            config.onAttachEvents();
            const submitHandler = passwordField.addEventListener.mock.calls.find((c: any) => c[0] === 'keypress')[1];

            submitHandler({ key: 'Enter' });

            expect(passwordField.value).toBe('');
            expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('password-input-overlay-backdrop');
            expect(onSubmit).toHaveBeenCalledWith('hunter2');
        });

        it('ignores non-Enter keypresses', () => {
            const onSubmit = jest.fn();
            const context = createContext();
            loadScript(context);
            const { keypressHandler } = attach(context);
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M', onSubmit });

            keypressHandler({ key: 'a' });

            expect(onSubmit).not.toHaveBeenCalled();
        });

        it('sends a message for a string submit callback', () => {
            const context = createContext();
            loadScript(context);
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M', onSubmit: 'submit-password' });
            const { config } = context.showCalls[0];
            const passwordField = createElement({ value: 'abc123' });
            context.document.getElementById = jest.fn((id: string) => (id === 'password-input-overlay-field' ? passwordField : null));
            config.onAttachEvents();
            const submitHandler = passwordField.addEventListener.mock.calls.find((c: any) => c[0] === 'keypress')[1];

            submitHandler({ key: 'Enter' });

            expect(context.postMessage).toHaveBeenCalledWith({ type: 'submit-password', password: 'abc123' });
        });

        it('clears the error display on input', () => {
            const context = createContext();
            loadScript(context);
            const { inputHandler, errorEl } = attach(context);
            errorEl.style.display = 'block';

            inputHandler();

            expect(errorEl.style.display).toBe('none');
        });
    });

    describe('cancel handling', () => {
        it('delegates to BaseOverlay.executeCallback with the cancel callback and clears the password field', () => {
            const onCancel = jest.fn();
            const context = createContext();
            loadScript(context);
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M', onCancel });
            const { config } = context.showCalls[0];
            const cancelBtn = createElement();
            const passwordField = createElement({ value: 'secret' });
            context.document.getElementById = jest.fn((id: string) => {
                if (id === 'password-input-overlay-cancel-btn') return cancelBtn;
                if (id === 'password-input-overlay-field') return passwordField;
                return null;
            });
            config.onAttachEvents();
            const cancelHandler = cancelBtn.addEventListener.mock.calls[0][1];

            cancelHandler();

            expect(passwordField.value).toBe('');
            expect(context.window.BaseOverlay.executeCallback).toHaveBeenCalledWith(onCancel, true, 'password-input-overlay-backdrop');
            expect(context.postMessage).not.toHaveBeenCalledWith({ type: 'password-input-cancelled' });
        });

        it('sends the default cancel message when no cancel callback is provided', () => {
            const context = createContext();
            loadScript(context);
            context.window.showPasswordInputOverlay({ title: 'T', message: 'M' });
            const { config } = context.showCalls[0];
            const cancelBtn = createElement();
            const passwordField = createElement({ value: 'secret' });
            context.document.getElementById = jest.fn((id: string) => {
                if (id === 'password-input-overlay-cancel-btn') return cancelBtn;
                if (id === 'password-input-overlay-field') return passwordField;
                return null;
            });
            config.onAttachEvents();
            const cancelHandler = cancelBtn.addEventListener.mock.calls[0][1];

            cancelHandler();

            expect(passwordField.value).toBe('');
            expect(context.window.BaseOverlay.executeCallback).toHaveBeenCalledWith(undefined, true, 'password-input-overlay-backdrop');
            expect(context.postMessage).toHaveBeenCalledWith({ type: 'password-input-cancelled' });
        });
    });

    it('hidePasswordInputOverlay clears the password field and hides the overlay', () => {
        const context = createContext();
        loadScript(context);
        const passwordField = createElement({ value: 'secret' });
        context.document.getElementById = jest.fn((id: string) => (id === 'password-input-overlay-field' ? passwordField : null));

        context.window.hidePasswordInputOverlay();

        expect(passwordField.value).toBe('');
        expect(context.window.BaseOverlay.hide).toHaveBeenCalledWith('password-input-overlay-backdrop');
    });

    it('hidePasswordInputOverlay does not throw when the password field is absent', () => {
        const context = createContext();
        loadScript(context);
        context.document.getElementById = jest.fn(() => null);

        expect(() => context.window.hidePasswordInputOverlay()).not.toThrow();
    });
});
