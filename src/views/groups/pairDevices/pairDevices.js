/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    // Use the VS Code API from error overlay (which loads first) or acquire if not available
    const vscode = window.vscodeApi || acquireVsCodeApi();

    // Track selected device IDs
    let selectedDevices = [];

    // Set up event listeners when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        const pairBtn = document.getElementById('pairBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const checkboxes = document.querySelectorAll('.device-checkbox');

        /**
         * Update the pair button state based on selected devices
         */
        function updatePairButton() {
            if (pairBtn) {
                pairBtn.disabled = selectedDevices.length !== 2;
            }
            updateCheckboxStates();
        }

        /**
         * Update checkbox states based on selection count
         * When 2 devices are selected, disable unselected checkboxes
         */
        function updateCheckboxStates() {
            const isMaxSelected = selectedDevices.length >= 2;
            
            checkboxes.forEach(function(checkbox) {
                const deviceId = checkbox.value;
                const isSelected = selectedDevices.includes(deviceId);
                const deviceItem = checkbox.closest('.device-item');
                
                if (isMaxSelected && !isSelected) {
                    checkbox.disabled = true;
                    if (deviceItem) {
                        deviceItem.classList.add('disabled');
                    }
                } else {
                    checkbox.disabled = false;
                    if (deviceItem) {
                        deviceItem.classList.remove('disabled');
                    }
                }
            });
        }

        /**
         * Handle checkbox change
         */
        function handleCheckboxChange(event) {
            const checkbox = event.target;
            const deviceId = checkbox.value;

            if (checkbox.checked) {
                if (selectedDevices.length >= 2) {
                    checkbox.checked = false;
                    return;
                }
                if (!selectedDevices.includes(deviceId)) {
                    selectedDevices.push(deviceId);
                }
            } else {
                selectedDevices = selectedDevices.filter(function(id) { return id !== deviceId; });
            }

            updatePairButton();
        }

        /**
         * Handle pair button click
         */
        function handlePairClick() {
            if (selectedDevices.length !== 2) {
                return;
            }

            // Disable both buttons during pairing to prevent cancellation mid-process
            if (pairBtn) {
                pairBtn.disabled = true;
                pairBtn.textContent = 'Pairing...';
            }
            if (cancelBtn) {
                cancelBtn.disabled = true;
            }

            vscode.postMessage({
                type: 'pair-devices',
                deviceIds: selectedDevices
            });
        }

        /**
         * Handle cancel button click
         */
        function handleCancelClick() {
            vscode.postMessage({
                type: 'cancel'
            });
        }

        // Attach event listeners to checkboxes
        checkboxes.forEach(function(checkbox) {
            checkbox.addEventListener('change', handleCheckboxChange);
        });

        // Attach event listeners to buttons
        if (pairBtn) {
            pairBtn.addEventListener('click', handlePairClick);
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', handleCancelClick);
        }

        // Initialize button state
        updatePairButton();
    });

    // Handle messages from the backend
    window.addEventListener('message', function(event) {
        const message = event.data;

        switch (message.type) {
            case 'pair-success':
                break;

            case 'pair-error':
                // Handle validation errors and unexpected exceptions
                // Re-enable buttons so user can correct the issue
                var pairBtn = document.getElementById('pairBtn');
                var cancelBtn = document.getElementById('cancelBtn');
                if (pairBtn) {
                    pairBtn.disabled = selectedDevices.length !== 2;
                    pairBtn.textContent = 'Pair Devices';
                }
                if (cancelBtn) {
                    cancelBtn.disabled = false;
                }
                break;

            case 'reset-pairing-state':
                // Re-enable buttons after error overlay is dismissed
                var pairBtn = document.getElementById('pairBtn');
                var cancelBtn = document.getElementById('cancelBtn');
                if (pairBtn) {
                    pairBtn.disabled = selectedDevices.length !== 2;
                    pairBtn.textContent = 'Pair Devices';
                }
                if (cancelBtn) {
                    cancelBtn.disabled = false;
                }
                break;

            case 'show-password-input':
                // Show password input overlay to prompt for sudo password
                if (window.showPasswordInputOverlay) {
                    window.showPasswordInputOverlay({
                        title: 'Sudo Password Required',
                        message: 'Enter your sudo password to configure ConnectX network interfaces for the paired devices.',
                        icon: 'codicon-lock',
                        fieldLabel: 'Sudo Password:',
                        placeholder: 'Enter password...',
                        hint: 'This password is required to configure network settings on your devices. It will be used for the sudo commands needed during the pairing process.',
                        submitButtonText: 'Continue',
                        cancelButtonText: 'Cancel',
                        validationErrorMessage: 'Password is required',
                        onSubmit: function(password) {
                            // Send password back to backend to create group and configure NICs
                            vscode.postMessage({
                                type: 'password-submitted',
                                password: password,
                                deviceIds: message.deviceIds,
                                deviceNames: message.deviceNames
                            });
                        },
                        onCancel: function() {
                            // User cancelled password input
                            vscode.postMessage({
                                type: 'password-input-cancelled'
                            });
                        }
                    });
                }
                break;

            case 'pairing-cancelled':
                // Reset UI when pairing is cancelled
                var pairBtn = document.getElementById('pairBtn');
                var cancelBtn = document.getElementById('cancelBtn');
                if (pairBtn) {
                    pairBtn.disabled = selectedDevices.length !== 2;
                    pairBtn.textContent = 'Pair Devices';
                }
                if (cancelBtn) {
                    cancelBtn.disabled = false;
                }
                break;

            case 'show-error-overlay':
                // Re-enable cancel button when error overlay is shown
                var cancelBtnOverlay = document.getElementById('cancelBtn');
                if (cancelBtnOverlay) {
                    cancelBtnOverlay.disabled = false;
                }
                // Call the error overlay function exposed by errorOverlay.js
                if (window.showErrorOverlay) {
                    // Determine onClose behavior (primary button)
                    let onClose = null;
                    if (message.onClose) {
                        onClose = message.onClose;
                    } else {
                        // Default: hide overlay and send close-error-overlay message
                        onClose = function() {
                            window.hideErrorOverlay();
                            vscode.postMessage({
                                type: 'close-error-overlay'
                            });
                        };
                    }
                    
                    // Handle secondary button if provided
                    let secondaryButton = null;
                    if (message.secondaryButton) {
                        secondaryButton = {
                            text: message.secondaryButton.text,
                            onClick: message.secondaryButton.onClick
                        };
                    }
                    
                    window.showErrorOverlay(
                        message.errorTitle,
                        message.errorDetails,
                        message.error,
                        onClose,
                        message.buttonText,
                        secondaryButton
                    );
                }
                break;
        }
    });
})();
