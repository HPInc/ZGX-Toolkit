/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Warning overlay widget component
 * Provides a reusable warning overlay with Continue and Cancel buttons.
 * Extends the BaseOverlay system for consistency with other overlays.
 * Requires baseOverlay.js to be loaded first.
 */

(function() {
    if (!window.BaseOverlay) {
        console.error('BaseOverlay not found. Make sure baseOverlay.js is loaded before warningOverlay.js.');
        throw new Error('BaseOverlay is required for warning overlay functionality.');
    }
    
    const vscode = window.vscodeApi;
    
    const BACKDROP_ID = 'warning-overlay-backdrop';
    const TEMPLATE_ID = 'warning-overlay-template';

    let continueCallback = null;
    let cancelCallback = null;

    /**
     * Show a warning overlay with Continue and Cancel buttons.
     * This function is exposed globally so any view can use it.
     * 
     * @param {string} title - The warning title
     * @param {string} message - The warning message (supports **bold**, *italic*, and - bullet list markdown)
     * @param {object} options - Configuration options
     * @param {function|string} options.onContinue - Callback or message type when Continue is clicked
     * @param {function|string} options.onCancel - Callback or message type when Cancel is clicked
     * @param {string} options.continueText - Custom text for Continue button (default: 'Continue')
     * @param {string} options.cancelText - Custom text for Cancel button (default: 'Cancel')
     * @param {string} options.iconColor - Optional CSS color value to override the header icon color
     * @param {boolean} options.hideMessageContainer - When true, removes the background/padding from the message container and hides the SVG icon
     * @param {string} options.listIndent - Optional CSS padding-left value for bullet list indentation
     * @param {string} options.firstLineFontSize - Optional CSS font-size value for the first paragraph
     * @param {Array<{word: string, color: string}>} options.colorWords - Optional array of words to color, each with a CSS color value
     */
    window.showWarningOverlay = function(title, message, options) {
        options = options || {};

        continueCallback = options.onContinue || null;
        cancelCallback = options.onCancel || null;

        window.BaseOverlay.show(TEMPLATE_ID, {
            backdropId: BACKDROP_ID,
            callbacks: { continueCallback, cancelCallback },
            
            onSetupContent: function(overlayContent) {
                setupWarningOverlayContent(overlayContent, title, message, options);
            },
            
            onAttachEvents: function() {
                attachWarningOverlayEvents();
            }
        });
    };

    /**
     * Setup warning overlay content
     */
    function setupWarningOverlayContent(overlayContent, title, message, options) {
        const titleEl = overlayContent.querySelector('#warning-overlay-title');
        const messageEl = overlayContent.querySelector('#warning-overlay-message');
        const continueBtnEl = overlayContent.querySelector('#warning-overlay-continue-btn');
        const cancelBtnEl = overlayContent.querySelector('#warning-overlay-cancel-btn');
        
        if (titleEl) {
            titleEl.textContent = title;
        }
        
        if (messageEl) {
            // Safely format markdown-style syntax while preventing XSS
            var formattedMessage = message
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(\S.*?)\*/g, '<em>$1</em>');

            // Convert bullet list lines ("- item") into <ul><li> elements
            var lines = formattedMessage.split('\n');
            var result = [];
            var inList = false;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (/^- (.+)/.test(line)) {
                    if (!inList) { result.push('<ul>'); inList = true; }
                    result.push('<li>' + line.replace(/^- /, '') + '</li>');
                } else {
                    if (inList) { result.push('</ul>'); inList = false; }
                    result.push(line === '' ? '<br>' : '<p style="margin:0 0 6px 0">' + line + '</p>');
                }
            }
            if (inList) { result.push('</ul>'); }
            messageEl.innerHTML = result.join('');

            if (options.listIndent) {
                var ulEl = messageEl.querySelector('ul');
                if (ulEl) {
                    ulEl.style.paddingLeft = options.listIndent;
                }
            }

            if (options.firstLineFontSize) {
                var firstP = messageEl.querySelector('p');
                if (firstP) {
                    firstP.style.fontSize = options.firstLineFontSize;
                }
            }

            if (options.colorWords) {
                options.colorWords.forEach(function(entry) {
                    var walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT, null, false);
                    var nodesToProcess = [];
                    while (walker.nextNode()) {
                        if (walker.currentNode.textContent.indexOf(entry.word) !== -1) {
                            nodesToProcess.push(walker.currentNode);
                        }
                    }
                    nodesToProcess.forEach(function(textNode) {
                        var parts = textNode.textContent.split(entry.word);
                        var fragment = document.createDocumentFragment();
                        for (var j = 0; j < parts.length; j++) {
                            if (j > 0) {
                                var span = document.createElement('span');
                                span.style.color = entry.color;
                                span.textContent = entry.word;
                                fragment.appendChild(span);
                            }
                            if (parts[j]) {
                                fragment.appendChild(document.createTextNode(parts[j]));
                            }
                        }
                        textNode.parentNode.replaceChild(fragment, textNode);
                    });
                });
            }
        }
        
        if (continueBtnEl && options.continueText) {
            continueBtnEl.textContent = options.continueText;
        }
        
        if (cancelBtnEl && options.cancelText) {
            cancelBtnEl.textContent = options.cancelText;
        }

        if (options.iconColor) {
            var iconEl = overlayContent.querySelector('.warning-overlay-icon');
            if (iconEl) {
                iconEl.style.color = options.iconColor;
            }
        }

        if (options.hideMessageContainer) {
            var containerEl = overlayContent.querySelector('.warning-overlay-message-container');
            var msgIconEl = overlayContent.querySelector('.warning-overlay-message-icon');
            if (containerEl) {
                containerEl.style.background = 'none';
                containerEl.style.padding = '0';
                containerEl.style.borderRadius = '0';
                containerEl.style.display = 'block';
            }
            if (msgIconEl) {
                msgIconEl.style.display = 'none';
            }
        }
    }

    /**
     * Attach warning overlay event listeners
     */
    function attachWarningOverlayEvents() {
        var backdrop = document.getElementById(BACKDROP_ID);
        var continueBtn = document.getElementById('warning-overlay-continue-btn');
        var cancelBtn = document.getElementById('warning-overlay-cancel-btn');

        if (continueBtn) {
            continueBtn.addEventListener('click', handleContinueClick);
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', handleCancelClick);
        }
        
        // Prevent backdrop clicks from closing
        if (backdrop) {
            backdrop.addEventListener('click', function(e) {
                window.BaseOverlay.preventBackdropClick(e, BACKDROP_ID);
            });
            backdrop.addEventListener('mousedown', window.BaseOverlay.stopEventPropagation);
            backdrop.addEventListener('mouseup', window.BaseOverlay.stopEventPropagation);
            backdrop.addEventListener('touchstart', window.BaseOverlay.stopEventPropagation);
            backdrop.addEventListener('touchend', window.BaseOverlay.stopEventPropagation);
        }
    }

    /**
     * Hide/remove the warning overlay
     */
    window.hideWarningOverlay = function() {
        window.BaseOverlay.hide(BACKDROP_ID);
        continueCallback = null;
        cancelCallback = null;
    };

    /**
     * Handle Continue button click
     */
    function handleContinueClick() {
        window.BaseOverlay.hide(BACKDROP_ID);
        
        if (continueCallback) {
            if (typeof continueCallback === 'function') {
                continueCallback();
            } else if (typeof continueCallback === 'string') {
                vscode.postMessage({ type: continueCallback });
            }
        }
        
        continueCallback = null;
        cancelCallback = null;
    }

    /**
     * Handle Cancel button click
     */
    function handleCancelClick() {
        window.BaseOverlay.hide(BACKDROP_ID);
        
        if (cancelCallback) {
            if (typeof cancelCallback === 'function') {
                cancelCallback();
            } else if (typeof cancelCallback === 'string') {
                vscode.postMessage({ type: cancelCallback });
            }
        }
        
        continueCallback = null;
        cancelCallback = null;
    }
})();
