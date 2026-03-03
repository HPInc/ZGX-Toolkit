/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Error overlay widget component
 * Provides a reusable error overlay that can be displayed on top of any view.
 * Extends the BaseOverlay system for consistency with other overlays.
 * Requires baseOverlay.js to be loaded first.
 */

(function() {
    if (!window.BaseOverlay) {
        console.error('BaseOverlay not found. Make sure baseOverlay.js is loaded before errorOverlay.js.');
        throw new Error('BaseOverlay is required for error overlay functionality.');
    }
    
    const vscode = window.vscodeApi;
    
    const BACKDROP_ID = 'error-overlay-backdrop';
    const TEMPLATE_ID = 'error-overlay-template';

    let closeCallback = null;
    let secondaryCallback = null;

    /**
     * Show error overlay when device health check fails or other errors occur.
     * This function is exposed globally so any view can use it.
     * 
     * @param {string} errorTitle - The main error title
     * @param {string} errorDetails - Additional details about the error
     * @param {string} error - Optional technical error message
     * @param {function|string} onClose - Optional callback to handle close action. Can be a function or a message type string. If not provided, sends 'close-error-overlay' message.
     * @param {string} buttonText - Optional custom text for the close button. Defaults to 'Return to Device Manager'.
     * @param {object} secondaryButton - Optional secondary button config: { text: string, onClick: function|string }
     */
    window.showErrorOverlay = function(errorTitle, errorDetails, error, onClose, buttonText, secondaryButton) {
        // Store callbacks
        closeCallback = onClose;
        secondaryCallback = secondaryButton ? secondaryButton.onClick : null;

        // Use unified overlay system
        window.BaseOverlay.show(TEMPLATE_ID, {
            backdropId: BACKDROP_ID,
            callbacks: { closeCallback, secondaryCallback },
            
            onSetupContent: function(overlayContent) {
                setupErrorOverlayContent(overlayContent, errorTitle, errorDetails, error, buttonText, secondaryButton);
            },
            
            onAttachEvents: function() {
                attachErrorOverlayEvents();
            }
        });
    };

    /**
     * Setup error overlay content
     */
    function setupErrorOverlayContent(overlayContent, errorTitle, errorDetails, error, buttonText, secondaryButton) {
        const titleEl = overlayContent.querySelector('#error-overlay-title');
        const messageEl = overlayContent.querySelector('#error-overlay-message');
        const detailsTextEl = overlayContent.querySelector('#error-overlay-details-text');
        const detailsEl = overlayContent.querySelector('#error-overlay-details');
        const closeBtnEl = overlayContent.querySelector('#error-overlay-close-btn');
        const secondaryBtnEl = overlayContent.querySelector('#error-overlay-secondary-btn');
        
        if (titleEl) {
            titleEl.textContent = errorTitle;
        }
        if (closeBtnEl && buttonText) {
            closeBtnEl.textContent = buttonText;
        }
        
        // Configure secondary button if provided
        if (secondaryButton && secondaryButton.text && secondaryButton.onClick && secondaryBtnEl) {
            secondaryBtnEl.textContent = secondaryButton.text;
            secondaryBtnEl.style.display = 'inline-block';
        }
        
        if (messageEl) {
            // Safely format markdown-style syntax while preventing XSS
            let formattedMessage = errorDetails
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(\S.*?)\*/g, '<em>$1</em>');
            messageEl.innerHTML = formattedMessage;
        }
        if (detailsTextEl && error) {
            detailsTextEl.textContent = error;
        }
        // Hide details section if no error provided
        if (detailsEl && !error) {
            detailsEl.style.display = 'none';
        }
    }

    /**
     * Attach error overlay event listeners
     */
    function attachErrorOverlayEvents() {
        const backdrop = document.getElementById(BACKDROP_ID);
        const closeBtn = document.getElementById('error-overlay-close-btn');
        const secondaryBtn = document.getElementById('error-overlay-secondary-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', handleErrorOverlayClose);
        }
        
        if (secondaryBtn && secondaryCallback) {
            secondaryBtn.addEventListener('click', handleSecondaryButtonClick);
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

    /**
     * Hide/remove the error overlay
     */
    window.hideErrorOverlay = function() {
        window.BaseOverlay.hide(BACKDROP_ID);
        closeCallback = null;
        secondaryCallback = null;
    };

    /**
     * Handle error overlay close action (primary button)
     * Calls custom callback if provided, otherwise sends default 'close-error-overlay' message
     */
    function handleErrorOverlayClose() {
        const shouldHideOverlay = !closeCallback || typeof closeCallback !== 'string' || closeCallback === 'close-error-overlay';
        
        if (shouldHideOverlay) {
            window.BaseOverlay.hide(BACKDROP_ID);
        }
        
        // Handle close action based on callback type
        if (closeCallback) {
            if (typeof closeCallback === 'function') {
                // Custom callback function
                closeCallback();
            } else if (typeof closeCallback === 'string') {
                // Message type string - send directly
                vscode.postMessage({ type: closeCallback });
            }
        } else {
            // Default behavior: send close message to backend
            vscode.postMessage({
                type: 'close-error-overlay'
            });
        }
        
        // Clear the callbacks
        closeCallback = null;
        secondaryCallback = null;
    }

    /**
     * Handle secondary button click
     * Calls the secondary callback if provided
     */
    function handleSecondaryButtonClick() {
        const shouldHideOverlay = typeof secondaryCallback === 'function';
        
        if (shouldHideOverlay) {
            window.BaseOverlay.hide(BACKDROP_ID);
        }
        
        if (secondaryCallback) {
            if (typeof secondaryCallback === 'function') {
                secondaryCallback();
            } else if (typeof secondaryCallback === 'string') {
                // Message type string - send directly for navigation
                vscode.postMessage({ type: secondaryCallback });
            }
        }
        
        // Clear the callbacks
        closeCallback = null;
        secondaryCallback = null;
    }
})();
