/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Password input overlay component
 * Extends the base overlay to provide password input functionality.
 * Requires baseOverlay.js to be loaded first.
 * 
 * This is a generic, reusable password input overlay that can be customized
 * with different titles, messages, labels, and button text.
 */

(function() {
    if (!window.BaseOverlay) {
        console.error('BaseOverlay not found. Make sure baseOverlay.js is loaded first.');
        return;
    }

    const BACKDROP_ID = 'password-input-overlay-backdrop';
    const TEMPLATE_ID = 'password-input-overlay-template';

    let submitCallback = null;
    let cancelCallback = null;

    /**
     * Show password input overlay
     * 
     * @param {object} options - Configuration options
     * @param {string} options.title - Title for the overlay (required)
     * @param {string} options.message - Message/description text (required)
     * @param {string} options.icon - Codicon class name (default: 'codicon-lock')
     * @param {string} options.fieldLabel - Label for the password field (default: 'Password:')
     * @param {string} options.placeholder - Placeholder text for the password field (default: 'Enter password...')
     * @param {string} options.hint - Optional hint text below the input field
     * @param {string} options.submitButtonText - Text for submit button (default: 'Continue')
     * @param {string} options.cancelButtonText - Text for cancel button (default: 'Cancel')
     * @param {string} options.validationErrorMessage - Error message for empty password (default: 'Password is required')
     * @param {function|string} options.onSubmit - Callback when password is submitted. Receives password as parameter. Can be a function or message type string.
     * @param {function|string} options.onCancel - Optional callback when cancelled. Can be a function or message type string.
     */
    window.showPasswordInputOverlay = function(options) {
        if (!options || !options.title || !options.message) {
            console.error('showPasswordInputOverlay requires title and message options');
            return;
        }
        
        // Store callbacks
        submitCallback = options.onSubmit;
        cancelCallback = options.onCancel;

        window.BaseOverlay.show(TEMPLATE_ID, {
            backdropId: BACKDROP_ID,
            
            onSetupContent: function(overlayContent) {
                // Set icon
                const iconEl = overlayContent.querySelector('#password-input-overlay-icon');
                if (iconEl) {
                    const iconClass = options.icon || 'codicon-lock';
                    iconEl.className = `codicon ${iconClass} overlay-icon password-input-icon`;
                }

                // Set title (required)
                const titleEl = overlayContent.querySelector('#password-input-overlay-title');
                if (titleEl) {
                    titleEl.textContent = options.title;
                }

                // Set message (required)
                const messageEl = overlayContent.querySelector('#password-input-overlay-message');
                if (messageEl) {
                    messageEl.textContent = options.message;
                }

                // Set field label
                const labelEl = overlayContent.querySelector('#password-input-overlay-label');
                if (labelEl) {
                    labelEl.textContent = options.fieldLabel || 'Password:';
                }

                // Set placeholder
                const fieldEl = overlayContent.querySelector('#password-input-overlay-field');
                if (fieldEl) {
                    fieldEl.placeholder = options.placeholder || 'Enter password...';
                }

                // Set hint (optional)
                const hintEl = overlayContent.querySelector('#password-input-overlay-hint');
                if (hintEl) {
                    if (options.hint) {
                        hintEl.textContent = options.hint;
                        hintEl.style.display = 'block';
                    } else {
                        hintEl.style.display = 'none';
                    }
                }

                // Set button text
                const submitBtn = overlayContent.querySelector('#password-input-overlay-submit-btn');
                if (submitBtn) {
                    submitBtn.textContent = options.submitButtonText || 'Continue';
                }

                const cancelBtn = overlayContent.querySelector('#password-input-overlay-cancel-btn');
                if (cancelBtn) {
                    cancelBtn.textContent = options.cancelButtonText || 'Cancel';
                }

                // Store validation error message for later use
                window._passwordInputValidationError = options.validationErrorMessage || 'Password is required';
            },
            
            onAttachEvents: function() {
                const backdrop = document.getElementById(BACKDROP_ID);
                const submitBtn = document.getElementById('password-input-overlay-submit-btn');
                const cancelBtn = document.getElementById('password-input-overlay-cancel-btn');
                const passwordField = document.getElementById('password-input-overlay-field');
                const errorEl = document.getElementById('password-input-overlay-error');

                // Focus the password field
                if (passwordField) {
                    setTimeout(() => passwordField.focus(), 100);
                }

                // Submit button click
                if (submitBtn) {
                    submitBtn.addEventListener('click', handleSubmit);
                }

                // Cancel button click
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', handleCancel);
                }

                // Enter key in password field
                if (passwordField) {
                    passwordField.addEventListener('keypress', function(event) {
                        if (event.key === 'Enter') {
                            handleSubmit();
                        }
                    });

                    // Clear error on input
                    passwordField.addEventListener('input', function() {
                        if (errorEl) {
                            errorEl.style.display = 'none';
                        }
                    });
                }

                // Prevent backdrop clicks from closing
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => 
                        window.BaseOverlay.preventBackdropClick(e, BACKDROP_ID));
                    backdrop.addEventListener('mousedown', window.BaseOverlay.stopEventPropagation);
                    backdrop.addEventListener('mouseup', window.BaseOverlay.stopEventPropagation);
                    backdrop.addEventListener('touchstart', window.BaseOverlay.stopEventPropagation);
                    backdrop.addEventListener('touchend', window.BaseOverlay.stopEventPropagation);
                }
            }
        });
    };

    /**
     * Hide password input overlay
     */
    window.hidePasswordInputOverlay = function() {
        // Clear password field
        const passwordField = document.getElementById('password-input-overlay-field');
        if (passwordField) {
            passwordField.value = '';
        }

        window.BaseOverlay.hide(BACKDROP_ID);
        submitCallback = null;
        cancelCallback = null;
    };

    /**
     * Handle submit action
     */
    function handleSubmit() {
        const passwordField = document.getElementById('password-input-overlay-field');
        const errorEl = document.getElementById('password-input-overlay-error');
        const password = passwordField ? passwordField.value : '';

        // Validate password
        if (!password || password.trim().length === 0) {
            if (errorEl) {
                errorEl.textContent = window._passwordInputValidationError || 'Password is required';
                errorEl.style.display = 'block';
            }
            if (passwordField) {
                passwordField.focus();
            }
            return;
        }

        // Clear the password field before hiding the overlay
        if (passwordField) {
            passwordField.value = '';
        }

        // Hide the overlay
        window.BaseOverlay.hide(BACKDROP_ID);

        // Execute submit callback with the password
        if (submitCallback && typeof submitCallback === 'function') {
            submitCallback(password);
        } else if (submitCallback && typeof submitCallback === 'string') {
            // If callback is a string message type, send it with the password
            window.BaseOverlay.sendMessage({
                type: submitCallback,
                password: password
            });
        }

        // Clear callbacks and validation error
        submitCallback = null;
        cancelCallback = null;
        window._passwordInputValidationError = null;
    }

    /**
     * Handle cancel action
     */
    function handleCancel() {
        // Clear password field for security
        const passwordField = document.getElementById('password-input-overlay-field');
        if (passwordField) {
            passwordField.value = '';
        }

        // Execute cancel callback
        window.BaseOverlay.executeCallback(cancelCallback, true, BACKDROP_ID);

        // If no cancel callback provided, send default cancel message
        if (!cancelCallback) {
            window.BaseOverlay.sendMessage({
                type: 'password-input-cancelled'
            });
        }

        // Clear callbacks
        submitCallback = null;
        cancelCallback = null;
    }
})();
