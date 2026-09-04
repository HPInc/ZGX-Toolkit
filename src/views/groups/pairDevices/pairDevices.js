/*
 * Copyright ©2025-2026 HP Development Company, L.P.
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
        const deviceTypeFilter = document.getElementById('deviceTypeFilter');
        const deviceTypeFilterToggle = document.getElementById('deviceTypeFilterToggle');
        const deviceTypeFilterMenu = document.getElementById('deviceTypeFilterMenu');
        const deviceTypeFilterLabel = document.getElementById('deviceTypeFilterLabel');
        const filterEmptyMessage = document.getElementById('filterEmptyMessage');
        const deviceCount = document.getElementById('deviceCount');
        const pairDiagram = document.getElementById('pairDiagram');
        const nanoDiagramUri = pairDiagram ? pairDiagram.dataset.nanoUri : '';
        const furyDiagramUri = pairDiagram ? pairDiagram.dataset.furyUri : '';
        const defaultDiagramType = pairDiagram ? pairDiagram.dataset.defaultType : 'nano';
        const deviceTypeFilterCheckboxes = document.querySelectorAll('.device-type-filter-checkbox');
        const checkboxes = document.querySelectorAll('.device-checkbox');

        /**
         * Update the pair button state based on selected devices
         */
        function updatePairButton() {
            if (pairBtn) {
                pairBtn.disabled = selectedDevices.length !== 2;
            }
            updateCheckboxStates();
            updateDiagram();
        }

        /**
         * Update checkbox states based on selection count
         * When 2 devices are selected, disable unselected checkboxes
         */
        function updateCheckboxStates() {
            const isMaxSelected = selectedDevices.length >= 2;
            const selectedType = getSelectedType();
            
            checkboxes.forEach(function(checkbox) {
                const deviceId = checkbox.value;
                const isSelected = selectedDevices.includes(deviceId);
                const deviceItem = checkbox.closest('.device-item');
                const isPaired = checkbox.dataset.isPaired === 'true';
                const isSupported = checkbox.dataset.isSupported === 'true';
                const deviceType = checkbox.dataset.deviceType;
                const isFilteredOut = deviceItem ? deviceItem.classList.contains('filtered-out') : false;
                let shouldDisable = isPaired || !isSupported || isFilteredOut;
                
                if (!shouldDisable) {
                    if (isMaxSelected && !isSelected) {
                        shouldDisable = true;
                    } else if (selectedDevices.length === 1 && !isSelected && selectedType && deviceType !== selectedType) {
                        shouldDisable = true;
                    }
                }

                checkbox.disabled = shouldDisable;

                if (deviceItem) {
                    if (isFilteredOut) {
                        deviceItem.classList.remove('disabled');
                    } else if (shouldDisable && !isPaired) {
                        deviceItem.classList.add('disabled');
                    } else {
                        deviceItem.classList.remove('disabled');
                    }
                }
            });
        }

        function applyDeviceTypeFilter() {
            const selectedFilterTypes = getSelectedFilterTypes();
            let visibleDeviceCount = 0;

            checkboxes.forEach(function(checkbox) {
                const deviceItem = checkbox.closest('.device-item');
                if (!deviceItem) {
                    return;
                }

                const deviceType = checkbox.dataset.deviceType;
                const shouldHide = selectedFilterTypes.size > 0 && !selectedFilterTypes.has(deviceType);

                deviceItem.classList.toggle('filtered-out', shouldHide);

                if (!shouldHide) {
                    visibleDeviceCount += 1;
                }

                if (shouldHide && checkbox.checked) {
                    checkbox.checked = false;
                    selectedDevices = selectedDevices.filter(function(id) { return id !== checkbox.value; });
                }
            });

            updateFilterLabel();

            if (filterEmptyMessage) {
                filterEmptyMessage.classList.toggle('hidden', visibleDeviceCount > 0);
            }

            if (deviceCount) {
                const suffix = visibleDeviceCount === 1 ? 'device' : 'devices';
                deviceCount.textContent = visibleDeviceCount + ' ' + suffix;
            }

            updatePairButton();
        }

        function getSelectedFilterTypes() {
            const selectedFilterTypes = new Set();
            deviceTypeFilterCheckboxes.forEach(function(checkbox) {
                if (checkbox.checked) {
                    selectedFilterTypes.add(checkbox.value);
                }
            });
            return selectedFilterTypes;
        }

        function updateFilterLabel() {
            if (!deviceTypeFilterLabel) {
                return;
            }

            const selectedFilterLabels = Array.from(deviceTypeFilterCheckboxes)
                .filter(function(checkbox) { return checkbox.checked; })
                .map(function(checkbox) {
                    const option = checkbox.closest('.device-type-filter-option');
                    const optionLabel = option ? option.dataset.filterLabel : '';
                    return optionLabel || checkbox.value;
                });

            if (selectedFilterLabels.length === 0) {
                deviceTypeFilterLabel.textContent = 'Filter by';
                return;
            }

            deviceTypeFilterLabel.textContent = selectedFilterLabels.join(', ');
        }

        function toggleFilterMenu(show) {
            if (!deviceTypeFilterMenu || !deviceTypeFilterToggle) {
                return;
            }

            const shouldShow = typeof show === 'boolean'
                ? show
                : deviceTypeFilterMenu.classList.contains('hidden');

            deviceTypeFilterMenu.classList.toggle('hidden', !shouldShow);
            deviceTypeFilterToggle.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
        }

        function getSelectedType() {
            if (selectedDevices.length === 0) {
                return null;
            }

            const selectedCheckbox = Array.from(checkboxes).find(function(checkbox) {
                return selectedDevices.includes(checkbox.value);
            });

            return selectedCheckbox ? selectedCheckbox.dataset.deviceType : null;
        }

        function mapDeviceTypeToDiagram(deviceType) {
            if (deviceType === 'zgx_fury') {
                return 'fury';
            }
            return 'nano';
        }

        function setDiagram(diagramType) {
            if (!pairDiagram) {
                return;
            }

            const useFury = diagramType === 'fury';
            const nextUri = useFury ? furyDiagramUri : nanoDiagramUri;

            if (nextUri) {
                pairDiagram.src = nextUri;
            }

            pairDiagram.alt = useFury ? 'ZGX Fury ConnectX Port Diagram' : 'ZGX Nano ConnectX Port Diagram';
        }

        function updateDiagram() {
            const selectedType = getSelectedType();
            if (selectedType) {
                setDiagram(mapDeviceTypeToDiagram(selectedType));
                return;
            }

            const selectedFilterTypes = getSelectedFilterTypes();
            if (selectedFilterTypes.size > 0) {
                const hasNanoFilter = selectedFilterTypes.has('zgx_nano');
                const hasFuryFilter = selectedFilterTypes.has('zgx_fury');

                // Keep Fury diagram unless Nano is explicitly part of the filter.
                if (hasFuryFilter && !hasNanoFilter) {
                    setDiagram('fury');
                    return;
                }

                // Nano takes precedence when explicitly included (including Nano+Fury).
                if (hasNanoFilter) {
                    setDiagram('nano');
                    return;
                }

                // Only unsupported filter types selected.
                setDiagram(defaultDiagramType);
                return;
            }

            setDiagram(defaultDiagramType);
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

        if (deviceTypeFilterToggle) {
            deviceTypeFilterToggle.addEventListener('click', function() {
                toggleFilterMenu();
            });
        }

        if (deviceTypeFilterCheckboxes.length > 0) {
            deviceTypeFilterCheckboxes.forEach(function(checkbox) {
                checkbox.addEventListener('change', applyDeviceTypeFilter);
            });
        }

        if (deviceTypeFilter) {
            document.addEventListener('click', function(event) {
                if (!deviceTypeFilter.contains(event.target)) {
                    toggleFilterMenu(false);
                }
            });

            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    toggleFilterMenu(false);
                }
            });
        }

        // Initialize button state
        applyDeviceTypeFilter();
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
                {
                    const pairBtn = document.getElementById('pairBtn');
                    const cancelBtn = document.getElementById('cancelBtn');
                    if (pairBtn) {
                        pairBtn.disabled = selectedDevices.length !== 2;
                        pairBtn.textContent = 'Pair Devices';
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
                }
                break;

            case 'reset-pairing-state':
                // Re-enable buttons after error overlay is dismissed
                {
                    const pairBtn = document.getElementById('pairBtn');
                    const cancelBtn = document.getElementById('cancelBtn');
                    if (pairBtn) {
                        pairBtn.disabled = selectedDevices.length !== 2;
                        pairBtn.textContent = 'Pair Devices';
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
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
                {
                    const pairBtn = document.getElementById('pairBtn');
                    const cancelBtn = document.getElementById('cancelBtn');
                    if (pairBtn) {
                        pairBtn.disabled = selectedDevices.length !== 2;
                        pairBtn.textContent = 'Pair Devices';
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
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
                    let onClose;
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
