/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    // Use an existing VS Code API instance if available, or acquire one if not
    const vscode = window.vscodeApi || acquireVsCodeApi();

    // Set up event listeners when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        var cancelBtn = document.getElementById('cancelBtn');
        var confirmUnpairBtn = document.getElementById('confirmUnpairBtn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'cancel' });
            });
        }

        if (confirmUnpairBtn) {
            confirmUnpairBtn.addEventListener('click', function() {
                // Disable buttons during unpair to prevent duplicate actions
                confirmUnpairBtn.disabled = true;
                confirmUnpairBtn.textContent = 'Unpairing...';
                if (cancelBtn) {
                    cancelBtn.disabled = true;
                }

                vscode.postMessage({ type: 'confirm-unpair' });
            });
        }

        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            var message = event.data;

            switch (message.type) {
                case 'unpair-error':
                    // Re-enable buttons on error so the user can retry
                    if (confirmUnpairBtn) {
                        confirmUnpairBtn.disabled = false;
                        confirmUnpairBtn.textContent = 'Confirm Unpair';
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
                    break;

                case 'show-password-input':
                    // Show password input overlay to prompt for sudo password
                    if (window.showPasswordInputOverlay) {
                        window.showPasswordInputOverlay({
                            title: 'Sudo Password Required',
                            message: 'Enter your sudo password to unconfigure ConnectX network interfaces on the devices.',
                            icon: 'codicon-lock',
                            fieldLabel: 'Sudo Password:',
                            placeholder: 'Enter password...',
                            hint: 'This password is required to remove network configuration from your devices.',
                            submitButtonText: 'Continue',
                            cancelButtonText: 'Cancel',
                            validationErrorMessage: 'Password is required',
                            onSubmit: function(password) {
                                vscode.postMessage({
                                    type: 'password-submitted',
                                    password: password,
                                    deviceIds: message.deviceIds,
                                    deviceNames: message.deviceNames
                                });
                            },
                            onCancel: function() {
                                vscode.postMessage({
                                    type: 'password-input-cancelled'
                                });
                            }
                        });
                    }
                    break;

                case 'show-error-overlay':
                    // Re-enable cancel button when error overlay is shown
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
                    if (window.showErrorOverlay) {
                        var onClose = null;
                        if (message.onClose) {
                            onClose = message.onClose;
                        } else {
                            onClose = function() {
                                window.hideErrorOverlay();
                                vscode.postMessage({
                                    type: 'close-error-overlay'
                                });
                            };
                        }

                        var secondaryButton = null;
                        if (message.secondaryButton) {
                            secondaryButton = {
                                text: message.secondaryButton.text,
                                onClick: message.secondaryButton.onClick
                            };
                        }

                        window.showErrorOverlay(
                            message.errorTitle,
                            message.errorDetails,
                            message.error,
                            onClose,
                            message.buttonText,
                            secondaryButton
                        );
                    }
                    break;
            }
        });
    });
})();
