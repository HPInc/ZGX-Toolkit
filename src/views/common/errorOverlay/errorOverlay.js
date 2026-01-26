/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Error overlay widget component
 * Provides a reusable error overlay that can be displayed on top of any view.
 * 
 * This script acquires the VS Code API and exposes it as window.vscodeApi for other scripts.
 */

(function() {
    // Acquire VS Code API if not already acquired
    if (!window.vscodeApi) {
        try {
            window.vscodeApi = acquireVsCodeApi();
        } catch (error) {
            console.error('Failed to acquire VS Code API. It may have already been acquired by another script.', error);
            throw new Error('VS Code API already acquired. Error overlay script must load first.');
        }
    }
    const vscode = window.vscodeApi;

    let closeCallback = null;

    /**
     * Show error overlay when device health check fails or other errors occur.
     * This function is exposed globally so any view can use it.
     * 
     * @param {string} errorTitle - The main error title
     * @param {string} errorDetails - Additional details about the error
     * @param {string} error - Optional technical error message
     * @param {function} onClose - Optional callback to handle close action. If not provided, sends 'close-error-overlay' message.
     */
    window.showErrorOverlay = function(errorTitle, errorDetails, error, onClose) {
        // Remove any existing overlay first
        const existingBackdrop = document.getElementById('error-overlay-backdrop');
        if (existingBackdrop) {
            existingBackdrop.remove();
            // Clear any existing callback from previous overlay
            closeCallback = null;
        }
        
        // Store the close callback for this overlay
        closeCallback = onClose;

        // Get the template element
        const template = document.getElementById('error-overlay-template');
        if (!template) {
            console.error('Error overlay template not found. Make sure errorOverlay.html is loaded.');
            return;
        }

        // Clone the template content
        const overlayContent = template.content.cloneNode(true);
        
        // Fill in the placeholders
        const titleEl = overlayContent.getElementById('error-overlay-title');
        const messageEl = overlayContent.getElementById('error-overlay-message');
        const detailsTextEl = overlayContent.getElementById('error-overlay-details-text');
        const detailsEl = overlayContent.getElementById('error-overlay-details');
        
        if (titleEl) {
            titleEl.textContent = errorTitle;
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

        // Append to body
        document.body.appendChild(overlayContent);

        // Attach event listeners to the actual DOM elements
        const backdrop = document.getElementById('error-overlay-backdrop');
        const closeBtn = document.getElementById('error-overlay-close-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', handleErrorOverlayClose);
        }
        
        // Prevent backdrop clicks from doing anything
        if (backdrop) {
            backdrop.addEventListener('click', preventBackdropClick);
            backdrop.addEventListener('mousedown', stopEventPropagation);
            backdrop.addEventListener('mouseup', stopEventPropagation);
            backdrop.addEventListener('touchstart', stopEventPropagation);
            backdrop.addEventListener('touchend', stopEventPropagation);
        }
    };

    /**
     * Hide/remove the error overlay
     */
    window.hideErrorOverlay = function() {
        const backdrop = document.getElementById('error-overlay-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        document.body.style.overflow = '';
        closeCallback = null;
    };

    /**
     * Prevent backdrop clicks from closing the overlay
     */
    function preventBackdropClick(event) {
        if (event.target.id === 'error-overlay-backdrop') {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /**
     * Stop event propagation through the backdrop
     */
    function stopEventPropagation(event) {
        event.stopPropagation();
    }

    /**
     * Handle error overlay close action
     * Calls custom callback if provided, otherwise sends default 'close-error-overlay' message
     */
    function handleErrorOverlayClose() {
        // Restore body scrolling before navigating away
        document.body.style.overflow = '';
        
        // Call custom close callback if provided, otherwise send default message
        if (closeCallback && typeof closeCallback === 'function') {
            closeCallback();
        } else {
            // Default behavior: navigate back to device manager
            vscode.postMessage({
                type: 'close-error-overlay'
            });
        }
        
        // Clear the callback
        closeCallback = null;
    }
})();
