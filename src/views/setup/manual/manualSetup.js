/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();    

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        const completeBtn = document.getElementById('completeBtn');
        const backBtns = document.querySelectorAll('[data-action="goBack"]');
        const platformTabs = document.querySelectorAll('.platform-tab');

        if (completeBtn) {
            completeBtn.addEventListener('click', completeManual);
        }

        backBtns.forEach(btn => {
            btn.addEventListener('click', goBack);
        });

        platformTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const platform = this.getAttribute('data-platform');
                if (platform) {
                    switchPlatform(platform);
                }
            });
        });
    });

    function switchPlatform(platform) {
        // All platform tabs now use the same platform names (windows, linux, mac)
        if (!platform) {return;}

        // Update all platform tabs across all steps
        const allTabs = document.querySelectorAll('.platform-tab');
        allTabs.forEach(tab => {
            const tabPlatform = tab.getAttribute('data-platform');
            if (tabPlatform === platform) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update all platform content across all steps
        const allContent = document.querySelectorAll('.platform-content');
        allContent.forEach(content => {
            const contentPlatform = content.getAttribute('data-platform');
            if (contentPlatform === platform) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    };

    function completeManual() {
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
    };

    function goBack() {
        console.log('goBack called, sending back message');
        vscode.postMessage({ type: 'back' });
    };

    // Copy button functionality
    document.addEventListener('click', function(event) {
        const target = event.target;
        if (target.classList.contains('copy-button')) {
            const textToCopy = target.getAttribute('data-copy');
            
            // Use the Clipboard API if available
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showCopyFeedback(target);
                }).catch(err => {
                    // Fallback
                    fallbackCopy(textToCopy, target);
                });
            } else {
                fallbackCopy(textToCopy, target);
            }
        }
    });

    function fallbackCopy(text, button) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            showCopyFeedback(button);
        } catch (err) {
            console.error('Failed to copy text', err);
        }
        
        document.body.removeChild(textArea);
    }

    function showCopyFeedback(button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.disabled = true;
        
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    }

    // Listen for messages from the extension
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        const completeBtn = document.getElementById('completeBtn');
        const errorMessage = document.getElementById('errorMessage');

        switch (msg.type) {
            case 'connectionTestFailed':
                // Show error message
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
