/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    // Use an existing VS Code API instance if available, or acquire one if not
    const vscode = window.vscodeApi || acquireVsCodeApi();

    // Set up event listeners when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        var closeBtn = document.getElementById('closeBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'cancel' });
            });
        }
    });
})();
