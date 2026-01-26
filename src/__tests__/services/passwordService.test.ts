/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */


import * as vscode from 'vscode';
import { PasswordService } from '../../services/passwordService';

describe('SudoPasswordService', () => {
    let service: PasswordService;

    beforeEach(() => {
        service = new PasswordService();
    });

    describe('promptForPassword', () => {
        it('should return password when user provides valid input', async () => {
            const mockPassword = 'test-password';
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(mockPassword);

            const result = await service.promptForPassword();

            expect(result).toBe(mockPassword);
            expect(vscode.window.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter your user password for your ZGX device',
                password: true,
                placeHolder: 'Password',
                ignoreFocusOut: true,
                validateInput: expect.any(Function)
            });
        });

        it('should return undefined when user cancels', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

            const result = await service.promptForPassword();

            expect(result).toBeUndefined();
        });

        it('should validate that password is not empty', async () => {
            const mockValidateInput = jest.fn();
            jest.spyOn(vscode.window, 'showInputBox').mockImplementation(async (options) => {
                if (options && options.validateInput) {
                    // Test validation with empty string
                    const emptyResult = options.validateInput('');
                    expect(emptyResult).toBe('Password cannot be empty');

                    // Test validation with whitespace
                    const whitespaceResult = options.validateInput('   ');
                    expect(whitespaceResult).toBe('Password cannot be empty');

                    // Test validation with valid password
                    const validResult = options.validateInput('valid-password');
                    expect(validResult).toBeNull();
                }
                return 'valid-password';
            });

            await service.promptForPassword();

            expect(vscode.window.showInputBox).toHaveBeenCalled();
        });
    });

    describe('promptForPasswordWithMessage', () => {
        it('should use custom message in prompt', async () => {
            const customMessage = 'Custom password prompt';
            const mockPassword = 'test-password';
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(mockPassword);

            const result = await service.promptForPassword(customMessage);

            expect(result).toBe(mockPassword);
            expect(vscode.window.showInputBox).toHaveBeenCalledWith({
                prompt: customMessage,
                password: true,
                placeHolder: 'Password',
                ignoreFocusOut: true,
                validateInput: expect.any(Function)
            });
        });

        it('should return undefined when user cancels', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

            const result = await service.promptForPassword('Custom message');

            expect(result).toBeUndefined();
        });
    });

    describe('showPasswordValidationError', () => {
        it('should return true when user selects Retry', async () => {
            jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Retry' as any);

            const result = await service.showPasswordValidationError();

            expect(result).toBe(true);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Invalid password. Please try again.',
                'Retry',
                'Cancel'
            );
        });

        it('should return false when user selects Cancel', async () => {
            jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Cancel' as any);

            const result = await service.showPasswordValidationError();

            expect(result).toBe(false);
        });

        it('should return false when user dismisses dialog', async () => {
            jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

            const result = await service.showPasswordValidationError();

            expect(result).toBe(false);
        });
    });

    describe('showPasswordRequiredWarning', () => {
        it('should return true when user selects Retry', async () => {
            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Retry' as any);

            const result = await service.showPasswordRequiredWarning();

            expect(result).toBe(true);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'A password is required to install these applications on your ZGX device.',
                'Retry',
                'Cancel'
            );
        });

        it('should return false when user selects Cancel', async () => {
            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cancel' as any);

            const result = await service.showPasswordRequiredWarning();

            expect(result).toBe(false);
        });

        it('should return false when user dismisses dialog', async () => {
            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

            const result = await service.showPasswordRequiredWarning();

            expect(result).toBe(false);
        });
    });
});
