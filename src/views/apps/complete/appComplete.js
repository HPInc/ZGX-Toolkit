/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up event listeners after DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Get device ID from the data
        const deviceIdMeta = document.querySelector('meta[name="device-id"]');
        const deviceId = deviceIdMeta ? deviceIdMeta.getAttribute('content') : '';

        // Get all buttons by data-action attribute
        const connectBtn = document.querySelector('button[data-action="connectNow"]');
        const inferenceBtn = document.querySelector('button[data-action="continueToInference"]');
        const retryBtn = document.querySelector('button[data-action="retryFailed"]');
        const closeBtn = document.querySelector('button[data-action="closePage"]');

        // Add event listeners to each button
        if (connectBtn) {
            connectBtn.addEventListener('click', function() {
                vscode.postMessage({
                    type: 'connect-device',
                    id: deviceId,
                    newWindow: true
                });
            });
        }

        if (inferenceBtn) {
            inferenceBtn.addEventListener('click', function() {
                vscode.postMessage({
                    type: 'continue-to-inference',
                    deviceId: deviceId
                });
            });
        }

        if (retryBtn) {
            retryBtn.addEventListener('click', function() {
                // Get failed app IDs from meta tag
                const failedAppIdsMeta = document.querySelector('meta[name="failed-app-ids"]');
                const failedAppIdsString = failedAppIdsMeta ? failedAppIdsMeta.getAttribute('content') : '';
                const failedApps = failedAppIdsString ? failedAppIdsString.split(',').filter(id => id.trim()) : [];

                const operationMeta = document.querySelector('meta[name="operation"]');
                const operation = operationMeta ? operationMeta.getAttribute('content') : 'install';

                vscode.postMessage({
                    type: 'retry-failed',
                    deviceId: deviceId,
                    failedApps: failedApps,
                    operation: operation
                });
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'cancel' });
            });
        }
    });
})();