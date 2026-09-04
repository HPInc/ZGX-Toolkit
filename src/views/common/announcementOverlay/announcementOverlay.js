/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Announcement overlay widget component
 * Provides a reusable one-time product announcement overlay with Dismiss and
 * Learn More actions.
 * Extends the BaseOverlay system for consistency with other overlays.
 * Requires baseOverlay.js to be loaded first.
 */

(function() {
    if (!window.BaseOverlay) {
        console.error('BaseOverlay not found. Make sure baseOverlay.js is loaded before announcementOverlay.js.');
        throw new Error('BaseOverlay is required for announcement overlay functionality.');
    }

    const vscode = window.vscodeApi;

    const BACKDROP_ID = 'announcement-overlay-backdrop';
    const TEMPLATE_ID = 'announcement-overlay-template';

    let dismissCallback = null;
    let learnMoreCallback = null;

    /**
     * Show a one-time product announcement overlay with Dismiss and Learn More actions.
     * This function is exposed globally so any view can use it.
     *
     * @param {string} title - The announcement title
     * @param {string} message - The announcement message
     * @param {object} options - Configuration options
     * @param {function|string} options.onDismiss - Callback or message type when Dismiss is clicked
     * @param {function|string} options.onLearnMore - Callback or message type when Learn More is clicked
     * @param {string} options.dismissText - Custom text for the Dismiss button (default: 'Dismiss')
     * @param {string} options.learnMoreText - Custom text for the Learn More button (default: 'Learn More')
     * @param {boolean} options.learnMoreIsPrimary - If true, styles the Learn More button as the primary (accent-colored) action
     * @param {string} options.icon - Optional codicon class name to override the header icon (default: 'codicon-star-full')
     * @param {string} options.iconImageUri - Optional image URI (e.g. a product logo) to use instead of the codicon icon
     */
    window.showAnnouncementOverlay = function(title, message, options) {
        options = options || {};

        dismissCallback = options.onDismiss || null;
        learnMoreCallback = options.onLearnMore || null;

        window.BaseOverlay.show(TEMPLATE_ID, {
            backdropId: BACKDROP_ID,
            callbacks: { dismissCallback, learnMoreCallback },

            onSetupContent: function(overlayContent) {
                setupAnnouncementOverlayContent(overlayContent, title, message, options);
            },

            onAttachEvents: function() {
                attachAnnouncementOverlayEvents();
            }
        });
    };

    /**
     * Setup announcement overlay content
     */
    function setupAnnouncementOverlayContent(overlayContent, title, message, options) {
        const titleEl = overlayContent.querySelector('#announcement-overlay-title');
        const messageEl = overlayContent.querySelector('#announcement-overlay-message');
        const dismissBtnEl = overlayContent.querySelector('#announcement-overlay-dismiss-btn');
        const learnMoreBtnEl = overlayContent.querySelector('#announcement-overlay-learn-more-btn');
        const iconEl = overlayContent.querySelector('.announcement-overlay-icon');
        const iconImgEl = overlayContent.querySelector('#announcement-overlay-icon-img');

        if (titleEl) {
            titleEl.textContent = title;
        }

        if (iconImgEl && options.iconImageUri) {
            // Use a custom image icon (e.g. a product logo)
            iconImgEl.src = options.iconImageUri;
            iconImgEl.classList.remove('hidden');
            if (iconEl) {
                iconEl.style.display = 'none';
            }
        } else if (iconEl && options.icon) {
            iconEl.className = 'codicon ' + options.icon + ' overlay-icon announcement-overlay-icon';
        }

        if (messageEl) {
            messageEl.innerHTML = formatAnnouncementMessage(message);
        }

        if (dismissBtnEl) {
            dismissBtnEl.textContent = options.dismissText || 'Dismiss';
        }

        if (learnMoreBtnEl) {
            learnMoreBtnEl.textContent = options.learnMoreText || 'Learn More';
            // Hide the Learn More button entirely if no handler was provided
            if (!options.onLearnMore) {
                learnMoreBtnEl.style.display = 'none';
            }
            // Optionally style the Learn More button as the primary (accent-colored) action
            if (options.learnMoreIsPrimary) {
                learnMoreBtnEl.classList.remove('overlay-btn-secondary');
                learnMoreBtnEl.classList.add('overlay-btn-primary');
            }
        }
    }

    /**
     * Safely format markdown-style syntax while preventing XSS.
     */
    function formatAnnouncementMessage(message) {
        var formattedMessage = message
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(\S.*?)\*/g, '<em>$1</em>');

        var lines = formattedMessage.split('\n');
        var result = [];
        var listMode = null; // 'ul' | 'ol' | null

        function closeList() {
            if (listMode) {
                result.push('</' + listMode + '>');
                listMode = null;
            }
        }

        for (var line of lines) {
            var bulletMatch = /^- (.+)/.exec(line);
            var numberedMatch = /^\d+\.\s+(.+)/.exec(line);
            var noteMatch = /^&gt;\s*(.+)/.exec(line);

            if (bulletMatch) {
                if (listMode !== 'ul') { closeList(); result.push('<ul>'); listMode = 'ul'; }
                result.push('<li>' + bulletMatch[1] + '</li>');
            } else if (numberedMatch) {
                if (listMode !== 'ol') { closeList(); result.push('<ol>'); listMode = 'ol'; }
                result.push('<li>' + numberedMatch[1] + '</li>');
            } else if (noteMatch) {
                closeList();
                result.push(
                    '<p class="announcement-overlay-note">' +
                    '<i class="codicon codicon-info announcement-overlay-note-icon"></i>' +
                    '<span>' + noteMatch[1] + '</span></p>'
                );
            } else {
                closeList();
                result.push(line === '' ? '<br>' : '<p>' + line + '</p>');
            }
        }
        closeList();

        return result.join('');
    }

    /**
     * Attach announcement overlay event listeners
     */
    function attachAnnouncementOverlayEvents() {
        var backdrop = document.getElementById(BACKDROP_ID);
        var dismissBtn = document.getElementById('announcement-overlay-dismiss-btn');
        var learnMoreBtn = document.getElementById('announcement-overlay-learn-more-btn');

        if (dismissBtn) {
            dismissBtn.addEventListener('click', handleDismissClick);
        }

        if (learnMoreBtn) {
            learnMoreBtn.addEventListener('click', handleLearnMoreClick);
        }

        // Prevent backdrop clicks from closing - this is a one-time announcement
        // and should only be dismissed via an explicit button click.
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
     * Handle Dismiss button click
     */
    function handleDismissClick() {
        window.BaseOverlay.hide(BACKDROP_ID);

        if (dismissCallback) {
            if (typeof dismissCallback === 'function') {
                dismissCallback();
            } else if (typeof dismissCallback === 'string') {
                vscode.postMessage({ type: dismissCallback });
            }
        }

        dismissCallback = null;
        learnMoreCallback = null;
    }

    /**
     * Handle Learn More button click
     */
    function handleLearnMoreClick() {
        window.BaseOverlay.hide(BACKDROP_ID);

        if (learnMoreCallback) {
            if (typeof learnMoreCallback === 'function') {
                learnMoreCallback();
            } else if (typeof learnMoreCallback === 'string') {
                vscode.postMessage({ type: learnMoreCallback });
            }
        }

        dismissCallback = null;
        learnMoreCallback = null;
    }
})();
