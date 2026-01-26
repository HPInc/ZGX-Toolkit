/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        const runBtn = document.getElementById('runBtn');
        const completeBtn = document.getElementById('completeBtn');
        const backBtns = document.querySelectorAll('[data-action="goBack"]');

        if (runBtn) {
            runBtn.addEventListener('click', runAutomatic);
        }

        if (completeBtn) {
            completeBtn.addEventListener('click', completeAutomatic);
        }

        backBtns.forEach(btn => {
            btn.addEventListener('click', goBack);
        });
    });

    function runAutomatic() {
        const runBtn = document.getElementById('runBtn');
        runBtn.disabled = true;
        document.getElementById('loading').classList.remove('hidden');
        vscode.postMessage({ type: 'automaticRun' });
    }

    function completeAutomatic() {
        const completeBtn = document.getElementById('completeBtn');
        const errorMessage = document.getElementById('errorMessage');
        
        // Hide any previous error
        if (errorMessage) {
            errorMessage.classList.add('hidden');
        }
        
        // Disable button and show testing state
        completeBtn.disabled = true;
        completeBtn.innerHTML = '<span class="spinner"></span> Testing...';
        
        vscode.postMessage({ type: 'testConnection' });
    }

    function goBack() {
        vscode.postMessage({ type: 'back' });
    }

    // Listen for messages from the extension
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        const completeBtn = document.getElementById('completeBtn');
        const errorMessage = document.getElementById('errorMessage');

        switch (msg.type) {
            case 'automaticRunStarted':
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('footerActions').classList.remove('hidden');
                break;

            case 'automaticError':
                // Show error message
                document.getElementById('loading').classList.add('hidden');
                const errorMsg = msg.error || 'An error occurred';
                
                // Create or update error display (legacy support)
                let errorBox = document.getElementById('errorBox');
                if (!errorBox) {
                    errorBox = document.createElement('div');
                    errorBox.id = 'errorBox';
                    errorBox.className = 'error-box';
                    errorBox.style.cssText = 'color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); padding: 12px; margin: 16px 0; border-radius: 4px;';
                    document.querySelector('.content').appendChild(errorBox);
                }
                errorBox.innerHTML = `<strong>Error:</strong> ${errorMsg}`;
                
                // Re-enable buttons
                const runBtn = document.getElementById('runBtn');
                if (runBtn) runBtn.disabled = false;
                if (completeBtn) completeBtn.disabled = false;
                break;

            case 'connectionTestFailed':
                // Show error message above footer
                document.getElementById('loading').classList.add('hidden');
                if (errorMessage) {
                    errorMessage.textContent = msg.error || 'Connection test failed. Please verify SSH setup.';
                    errorMessage.classList.remove('hidden');
                }
                
                // Re-enable button with original text
                if (completeBtn) {
                    completeBtn.disabled = false;
                    completeBtn.innerHTML = 'Test Connection';
                }
                break;

            case 'connectionTestSuccess':
                // Success is handled by navigation, but we can update button if needed
                if (completeBtn) {
                    completeBtn.innerHTML = '<span class="codicon codicon-check"></span> Success!';
                }
                break;
        }
    });
})();
