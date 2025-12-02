/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        const connectBtn = document.getElementById('connectBtn');
        const continueBtn = document.getElementById('continueBtn');
        const backBtn = document.getElementById('backBtn');

        if (connectBtn) {
            connectBtn.addEventListener('click', connectNow);
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', continueToFineTuning);
            
            // Mark button as loading and send message to check installation status
            continueBtn.classList.add('loading');
            
            const deviceId = continueBtn.getAttribute('data-id');
            vscode.postMessage({
                type: 'check-zgx-python-env',
                deviceId: deviceId
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', goBack);
        }
    });

    // Listen for messages from the extension
    window.addEventListener('message', function(event) {
        const message = event.data;
        
        if (message.type === 'zgx-python-env-status') {
            const continueBtn = document.getElementById('continueBtn');
            if (continueBtn) {
                // Remove loading spinner
                continueBtn.classList.remove('loading');
                
                if (message.isInstalled) {
                    // Enable the button
                    continueBtn.disabled = false;
                    continueBtn.title = 'Continue to Fine-Tuning Instructions';
                } else {
                    // Keep button disabled with tooltip
                    continueBtn.disabled = true;
                    continueBtn.title = 'Fine-Tuning requires the ZGX Python Environment to be installed';
                }
            }
        }
    });

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

    function connectNow() {
        const connectBtn = document.getElementById('connectBtn');
        const deviceId = connectBtn ? connectBtn.getAttribute('data-id') : null;
        
        if (!deviceId) {
            console.error('No device ID found');
            return;
        }
        vscode.postMessage({ 
            type: 'connect-device',
            id: deviceId,
            newWindow: true
        });
    }

    function continueToFineTuning() {
        const continueBtn = document.getElementById('continueBtn');
        
        // Only proceed if button is enabled
        if (continueBtn && !continueBtn.disabled) {
            const deviceId = continueBtn.getAttribute('data-id');
            vscode.postMessage({ 
                type: 'continue-to-finetuning',
                deviceId: deviceId
            });
        }
    }

    function goBack() {
        vscode.postMessage({ 
            type: 'navigate',
            targetView: 'devices/manager'
        });
    }
})();
