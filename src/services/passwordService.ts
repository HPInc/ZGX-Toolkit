/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';

/**
 * Service for prompting users for passwords.
 * This service NEVER stores or caches passwords - it only provides
 * an interface to prompt the user when needed.
 */
export class PasswordService {
    /**
     * Prompt the user for their password.
     * 
     * @returns The password entered by the user, or undefined if cancelled
     */
    public async promptForPassword(message?: string): Promise<string | undefined> {
        logger.info('Prompting user for password');

        const password = await vscode.window.showInputBox({
            prompt: message || 'Enter your user password for your ZGX device',
            password: true,
            placeHolder: 'Password',
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Password cannot be empty';
                }
                return null;
            }
        });

        if (password) {
            logger.info('User provided password');
        } else {
            logger.warn('User cancelled password prompt');
        }

        return password;
    }

    /**
     * Show a retry dialog when password validation fails.
     * 
     * @returns True if user wants to retry, false if cancelled
     */
    public async showPasswordValidationError(): Promise<boolean> {
        logger.warn('Password validation failed');

        const selection = await vscode.window.showErrorMessage(
            'Invalid password. Please try again.',
            'Retry',
            'Cancel'
        );

        return selection === 'Retry';
    }

    /**
     * Show a warning when sudo is required but no password provided.
     * 
     * @returns True if user wants to retry, false if cancelled
     */
    public async showPasswordRequiredWarning(): Promise<boolean> {
        logger.warn('Password required but not provided');

        const selection = await vscode.window.showWarningMessage(
            'A password is required to install these applications on your ZGX device.',
            'Retry',
            'Cancel'
        );

        return selection === 'Retry';
    }
}
