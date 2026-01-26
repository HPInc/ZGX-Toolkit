/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        // Copy button handler
        document.addEventListener('click', function(e) {
            const target = e.target;
            if (target && target.classList && target.classList.contains('copy-button')) {
                const txt = target.getAttribute('data-copy');
                if (txt) {
                    navigator.clipboard.writeText(txt);
                    const original = target.textContent;
                    target.textContent = 'Copied!';
                    setTimeout(function() { target.textContent = original || 'Copy'; }, 2000);
                }
            }
        });
    });
})();
