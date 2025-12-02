/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();
    let selectedOption = null;

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        // Option widget click handlers
        document.querySelectorAll('.option-widget').forEach(widget => {
            widget.addEventListener('click', function(e) {
                // Don't trigger if clicking the button
                if (e.target.classList.contains('next-button')) {
                    return;
                }
                
                const option = this.getAttribute('data-option');
                selectOption(option);
            });
        });

        // Next button click handlers
        document.querySelectorAll('.next-button').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const option = this.getAttribute('data-option');
                proceedWithOption(option);
            });
        });

        // Cancel button
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', navigateBack);
        }
    });

    function selectOption(option) {
        selectedOption = option;
        
        // Update UI
        document.querySelectorAll('.option-widget').forEach(widget => {
            widget.classList.remove('selected');
        });
        
        const selectedWidget = document.querySelector(`[data-option="${option}"]`);
        if (selectedWidget) {
            selectedWidget.classList.add('selected');
        }
    }

    function proceedWithOption(option) {
        vscode.postMessage({
            type: 'setup-option-selected',
            option: option
        });
    }

    function navigateBack() {
        vscode.postMessage({ type: 'navigate-back' });
    }
})();
