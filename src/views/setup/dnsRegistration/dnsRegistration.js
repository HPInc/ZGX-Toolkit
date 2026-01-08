/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    let passwordInput;
    let passwordSubmitBtn;
    let passwordFeedback;
    let passwordSection;
    let statusText;

    document.addEventListener('DOMContentLoaded', function() {
        passwordInput = document.getElementById('password-input');
        passwordSubmitBtn = document.getElementById('password-submit-btn');
        passwordFeedback = document.getElementById('password-feedback');
        passwordSection = document.getElementById('password-section');
        statusText = document.getElementById('status-text');

        if (passwordSubmitBtn) {
            passwordSubmitBtn.addEventListener('click', validatePassword);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    validatePassword();
                }
            });
        }
    });

    function validatePassword() {
        const password = passwordInput.value;

        if (!password) {
            showPasswordFeedback('Please enter a password', 'error');
            return;
        }

        // Disable input and button
        passwordInput.disabled = true;
        passwordSubmitBtn.disabled = true;
        passwordSubmitBtn.innerHTML = '<span class="spinner"></span> Verifying...';

        // Hide previous feedback
        hidePasswordFeedback();

        // Send password to extension for validation
        vscode.postMessage({
            type: 'validatePassword',
            password: password
        });
    }

    function showPasswordFeedback(message, type) {
        passwordFeedback.textContent = message;
        passwordFeedback.className = 'password-feedback visible ' + type;
    }

    function hidePasswordFeedback() {
        passwordFeedback.className = 'password-feedback';
    }

    // Listen for messages from the extension
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'serviceAlreadyRegistered':
                // Service already registered, show success
                statusText.textContent = 'mDNS service already registered!';
                break;

            case 'showPasswordPrompt':
                // Show password section and hide status
                document.getElementById('status-container').classList.add('hidden');
                passwordSection.classList.remove('hidden');
                setTimeout(() => {
                    passwordInput.focus();
                }, 100);
                break;

            case 'passwordValidationResult':
                if (msg.valid) {
                    // Password is valid
                    showPasswordFeedback('Password verified successfully!', 'success');
                    passwordSubmitBtn.innerHTML = '<span class="codicon codicon-check"></span> Verified';
                    statusText.textContent = 'Registering mDNS service...';
                    
                    // Hide password section and show status
                    setTimeout(() => {
                        passwordSection.classList.add('hidden');
                        document.getElementById('status-container').classList.remove('hidden');
                    }, 800);
                } else {
                    // Password is invalid - allow retry
                    showPasswordFeedback(msg.error || 'Invalid password. Please try again.', 'error');
                    passwordInput.disabled = false;
                    passwordSubmitBtn.disabled = false;
                    passwordSubmitBtn.innerHTML = 'Verify Password';
                    passwordInput.value = '';
                    passwordInput.focus();
                }
                break;

            case 'registrationComplete':
                if (msg.success) {
                    statusText.textContent = 'mDNS service registered successfully!';
                } else {
                    statusText.textContent = msg.error || 'mDNS registration failed';
                    
                    if (msg.allowRetry) {
                        // Show password section again for retry
                        document.getElementById('status-container').classList.add('hidden');
                        passwordSection.classList.remove('hidden');
                        passwordInput.disabled = false;
                        passwordSubmitBtn.disabled = false;
                        passwordSubmitBtn.innerHTML = 'Verify Password';
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                }
                break;
        }
    });
})();
