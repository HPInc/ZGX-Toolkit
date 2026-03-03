/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Base overlay widget component
 * Provides a reusable overlay foundation that can be extended for different use cases.
 * 
 * This script acquires the VS Code API and exposes it as window.vscodeApi for other scripts.
 * Extended overlays (error, input, etc.) inherit from this base functionality.
 */

(function() {
    // Acquire VS Code API if not already acquired
    if (!window.vscodeApi) {
        try {
            window.vscodeApi = acquireVsCodeApi();
        } catch (error) {
            console.error('Failed to acquire VS Code API. It may have already been acquired by another script.', error);
            throw new Error('VS Code API already acquired. Base overlay script must load first.');
        }
    }
    const vscode = window.vscodeApi;

    /**
     * Base Overlay Manager
     * Handles common overlay functionality
     */
    window.BaseOverlay = {
        /**
         * Show a generic overlay using a template
         * 
         * @param {string} templateId - ID of the template to use
         * @param {object} config - Configuration object
         * @param {string} config.backdropId - ID for the backdrop element
         * @param {function} config.onSetupContent - Callback to populate template content
         * @param {function} config.onAttachEvents - Callback to attach event listeners
         * @param {object} config.callbacks - Object containing callback functions
         */
        show: function(templateId, config) {
            // Remove any existing overlay with the same backdropId
            const existingBackdrop = document.getElementById(config.backdropId);
            if (existingBackdrop) {
                existingBackdrop.remove();
            }
            
            // Get the template element
            const template = document.getElementById(templateId);
            if (!template) {
                console.error(`Template ${templateId} not found. Make sure the template is loaded.`);
                return;
            }

            // Clone the template content
            const overlayContent = template.content.cloneNode(true);
            
            // Let the caller populate the content
            if (config.onSetupContent) {
                config.onSetupContent(overlayContent);
            }

            // Append to body
            document.body.appendChild(overlayContent);

            // Let the caller attach event listeners
            if (config.onAttachEvents) {
                config.onAttachEvents(config.callbacks);
            }

            // Prevent body scrolling
            document.body.style.overflow = 'hidden';
        },

        /**
         * Hide and remove an overlay
         * 
         * @param {string} backdropId - ID of the backdrop element to remove
         */
        hide: function(backdropId) {
            const backdrop = document.getElementById(backdropId);
            if (backdrop) {
                backdrop.remove();
            }
            document.body.style.overflow = '';
        },

        /**
         * Prevent backdrop clicks from closing the overlay
         */
        preventBackdropClick: function(event, backdropId) {
            if (event.target.id === backdropId) {
                event.preventDefault();
                event.stopPropagation();
            }
        },

        /**
         * Stop event propagation through the backdrop
         */
        stopEventPropagation: function(event) {
            event.stopPropagation();
        },

        /**
         * Send a message to the backend
         */
        sendMessage: function(message) {
            vscode.postMessage(message);
        },

        /**
         * Execute a callback (function or string message type)
         * 
         * @param {function|string} callback - Function to execute or message type to send
         * @param {boolean} shouldHideOverlay - Whether to hide the overlay before executing
         * @param {string} backdropId - ID of the backdrop to hide
         */
        executeCallback: function(callback, shouldHideOverlay, backdropId) {
            if (shouldHideOverlay && backdropId) {
                this.hide(backdropId);
            }
            
            // Restore body scrolling before any action
            document.body.style.overflow = '';
            
            if (callback) {
                if (typeof callback === 'function') {
                    // Custom callback function
                    callback();
                } else if (typeof callback === 'string') {
                    // Message type string - send directly
                    this.sendMessage({ type: callback });
                }
            }
        }
    };
})();
