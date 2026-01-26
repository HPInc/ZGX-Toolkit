/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up after DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        
        // Cache DOM elements
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const passwordSection = document.getElementById('password-section');
        const passwordInput = document.getElementById('password-input');
        const passwordSubmitBtn = document.getElementById('password-submit-btn');
        const passwordFeedback = document.getElementById('password-feedback');

        // Password submission handler
        if (passwordSubmitBtn) {
            passwordSubmitBtn.addEventListener('click', submitPassword);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    submitPassword();
                }
            });
        }

        function submitPassword() {
            const password = passwordInput?.value;
            if (!password || password.trim().length === 0) {
                showPasswordFeedback('Password cannot be empty', 'error');
                return;
            }

            // Disable input while validating
            if (passwordInput) passwordInput.disabled = true;
            if (passwordSubmitBtn) passwordSubmitBtn.disabled = true;
            
            showPasswordFeedback('Verifying password...', 'validating');

            // Send password to extension for validation
            const message = {
                type: 'validatePassword',
                password: password
            };
            vscode.postMessage(message);
            // Clear password from input field and message object
            if (passwordInput) passwordInput.value = '';
            message.password = '';
        }

        function showPasswordFeedback(message, type) {
            if (passwordFeedback) {
                passwordFeedback.textContent = message;
                passwordFeedback.className = 'password-feedback ' + type;
            }
        }

        function hidePasswordSection() {
            if (passwordSection) {
                passwordSection.classList.add('hidden');
            }
        }

        function showPasswordSection() {
            if (passwordSection) {
                passwordSection.classList.remove('hidden');
            }
        }

        function resetPasswordInput() {
            if (passwordInput) {
                passwordInput.disabled = false;
                passwordInput.value = '';
                passwordInput.focus();
            }
            if (passwordSubmitBtn) {
                passwordSubmitBtn.disabled = false;
            }
        }

        // Listen for progress updates from the extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || !message.type) return;

            switch (message.type) {
                case 'showPasswordPrompt':
                    showPasswordSection();
                    if (passwordInput) passwordInput.focus();
                    break;

                case 'passwordValidationResult':
                    if (message.valid) {
                        showPasswordFeedback('Password verified successfully', 'success');
                        setTimeout(() => {
                            hidePasswordSection();
                        }, 500);
                    } else {
                        showPasswordFeedback('Invalid password.', 'error');
                        resetPasswordInput();
                    }
                    break;

                case 'progress':
                    updateProgress(message.progress, message.status);
                    break;
                
                case 'appStatus':
                    updateAppStatus(message.appId, message.status);
                    break;

                case 'complete':
                    handleComplete(message);
                    break;

                case 'error':
                    handleError(message);
                    break;
            }
        });

        function updateProgress(percentage, status) {
            if (progressFill) {
                progressFill.style.width = percentage + '%';
            }
            if (progressText) {
                progressText.textContent = status;
            }
        }

        function updateAppStatus(appId, status) {
            const statusEl = document.getElementById(`status-${appId}`);
            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = 'app-status status-' + status.toLowerCase().replace(' ', '-');
            }
        }

        function handleComplete(message) {
            if (progressText) {
                progressText.textContent = message.message || 'Complete';
            }
            if (progressFill) {
                progressFill.style.width = '100%';
            }
        }

        function handleError(message) {
            if (progressText) {
                progressText.textContent = message.message || 'Error occurred';
                progressText.style.color = 'var(--vscode-errorForeground)';
            }
        }
    });
})();
