/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        const continueBtn = document.getElementById('continueBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (continueBtn) {
            continueBtn.addEventListener('click', setupComplete);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', closePage);
        }
    });

    function setupComplete() {
        vscode.postMessage({ type: 'setup-complete' });
    }

    function closePage() {
        vscode.postMessage({ type: 'cancel' });
    }
})();
