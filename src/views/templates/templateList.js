/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function () {
    const vscode = acquireVsCodeApi();

    function send(type, payload = {}) {
        vscode.postMessage({ type, ...payload });
    }

    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
            send('template-select', { id: card.getAttribute('data-id') });
        });
        card.addEventListener('keypress', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                send('template-select', { id: card.getAttribute('data-id') });
            }
        });
    });
})();
