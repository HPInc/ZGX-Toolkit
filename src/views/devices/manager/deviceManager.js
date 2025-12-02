/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function () {
    const vscode = acquireVsCodeApi();
    let discoveredDevices = [];

    // Initialize editingDeviceId from data attribute if present
    const formContainer = document.getElementById('addDeviceForm');
    let editingDeviceId = formContainer?.getAttribute('data-editing-id') || null;
    if (editingDeviceId === '') {
        editingDeviceId = null;
    }

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function () {
        // Form submission handler
        const deviceForm = document.getElementById('deviceForm');
        if (deviceForm) {
            deviceForm.addEventListener('submit', handleFormSubmit);
        }

        // Show form button
        const showFormBtn = document.getElementById('showFormBtn');
        if (showFormBtn) {
            showFormBtn.addEventListener('click', showAddForm);
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelForm);
        }

        // Discover button
        const discoverBtn = document.getElementById('discoverBtn');
        if (discoverBtn) {
            discoverBtn.addEventListener('click', discoverDevices);
        }

        // Edit buttons
        document.querySelectorAll('.edit-icon').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                showEditForm(deviceId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.remove-icon').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'delete-device',
                    id: deviceId
                });
            });
        });

        // Connect buttons (main split button)
        document.querySelectorAll('.connect-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'connect-device',
                    id: deviceId,
                    newWindow: false
                });
            });
        });

        // Connect dropdown buttons
        document.querySelectorAll('.split-button-dropdown').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const splitButton = this.closest('.split-button');
                const dropdown = splitButton.querySelector('.dropdown-content');

                if (!dropdown) {
                    console.error('Dropdown not found for split button');
                    return;
                }

                // Close all other dropdowns first
                document.querySelectorAll('.dropdown-content').forEach(d => {
                    if (d !== dropdown) {
                        d.classList.remove('show');
                    }
                });

                // Toggle this dropdown
                dropdown.classList.toggle('show');
            });
        });

        // Dropdown item click handlers
        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                const action = this.getAttribute('data-action');
                const id = this.getAttribute('data-id');

                vscode.postMessage({
                    type: 'connect-device',
                    id: id,
                    newWindow: action === 'new'
                });

                // Close the dropdown
                this.closest('.dropdown-content').classList.remove('show');
            });
        });

        // Manage apps buttons
        document.querySelectorAll('.manage-apps-button').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'manage-apps',
                    id: deviceId
                });
            });
        });

        // Setup buttons
        document.querySelectorAll('.setup-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'setup-device',
                    id: deviceId
                });
            });
        });

        // Host input focus/input handlers for discovered devices
        const hostInput = document.getElementById('deviceHost');
        if (hostInput) {
            hostInput.addEventListener('focus', function () {
                if (discoveredDevices.length > 0) {
                    showDevicesDropdown();
                }
            });

            hostInput.addEventListener('input', function () {
                if (discoveredDevices.length > 0) {
                    showDevicesDropdown();
                }
            });
        }

        // Add global click listener to handle clicks outside dropdowns
        document.addEventListener('click', handleOutsideClick);
    });

    function handleFormSubmit(e) {
        e.preventDefault();

        const device = {
            name: document.getElementById('deviceName').value.trim(),
            host: document.getElementById('deviceHost').value.trim(),
            username: document.getElementById('deviceUsername').value.trim(),
            port: parseInt(document.getElementById('devicePort').value),
        };

        // Validation
        if (!device.name || !device.host || !device.username || !device.port) {
            vscode.postMessage({
                type: 'show-error',
                message: 'Please fill in all required fields.'
            });
            return;
        }

        if (device.port < 1 || device.port > 65535) {
            vscode.postMessage({
                type: 'show-error',
                message: 'Please enter a valid port number (1-65535).'
            });
            return;
        }

        if (editingDeviceId) {
            vscode.postMessage({
                type: 'update-device',
                id: editingDeviceId,
                updates: device
            });
        } else {
            vscode.postMessage({
                type: 'create-device',
                data: device
            });
        }
    }

    function handleOutsideClick(e) {
        // Handle split button dropdowns
        if (!e.target.closest('.split-button')) {
            document.querySelectorAll('.dropdown-content').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
        
        // Handle devices dropdown - hide if click is outside the host input wrapper
        if (!e.target.closest('.host-input-wrapper')) {
            hideDevicesDropdown();
        }
    }

    // Functions
    function showAddForm() {
        editingDeviceId = null;
        resetForm();
        hideFormError();
        document.getElementById('addDeviceForm').classList.remove('hidden');
        document.getElementById('showFormBtn').classList.add('hidden');
        document.getElementById('formTitle').textContent = 'Add New Device';
        document.getElementById('submitBtn').textContent = 'Add Device';
        document.getElementById('deviceName').focus();
    }

    function showEditForm(deviceId) {
        // Find the device card to get the data
        const deviceCard = document.querySelector(`.device-card[data-id="${deviceId}"]`);
        if (!deviceCard) {
            console.error('device card not found for ID:', deviceId);
            return;
        }

        // Get device data from data attributes
        const name = deviceCard.getAttribute('data-name');
        const host = deviceCard.getAttribute('data-host');
        const username = deviceCard.getAttribute('data-username');
        const port = deviceCard.getAttribute('data-port');

        // Set editing state
        editingDeviceId = deviceId;

        // Populate form fields
        document.getElementById('deviceName').value = name;
        document.getElementById('deviceHost').value = host;
        document.getElementById('deviceUsername').value = username;
        document.getElementById('devicePort').value = port;

        // Clear any previous error
        hideFormError();

        // Update form UI
        document.getElementById('addDeviceForm').classList.remove('hidden');
        document.getElementById('showFormBtn').classList.add('hidden');
        document.getElementById('formTitle').textContent = 'Edit Device';
        document.getElementById('submitBtn').textContent = 'Update Device';

        // Focus on name field
        document.getElementById('deviceName').focus();
    }

    function cancelForm() {
        editingDeviceId = null;
        resetForm();
        hideFormError();
        document.getElementById('addDeviceForm').classList.add('hidden');
        document.getElementById('showFormBtn').classList.remove('hidden');
    }

    function resetForm() {
        document.getElementById('deviceForm').reset();
        document.getElementById('devicePort').value = '22';
        hideFormError();

        // Clear discovery status
        const statusEl = document.getElementById('discoveryStatus');
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
        statusEl.className = 'discovery-status hidden';

        // Hide and clear dropdown
        hideDevicesDropdown();
        discoveredDevices = [];
        document.getElementById('devicesDropdown').innerHTML = '';
    }

    function discoverDevices() {
        const btn = document.getElementById('discoverBtn');
        const btnText = document.getElementById('discoverBtnText');
        const spinner = document.getElementById('discoverSpinner');
        const statusEl = document.getElementById('discoveryStatus');

        // Disable button and show spinner
        btn.disabled = true;
        btnText.textContent = 'Discovering...';
        spinner.classList.remove('hidden');

        // Show status
        statusEl.classList.remove('hidden');
        statusEl.textContent = 'Searching for devices...';
        statusEl.className = 'discovery-status';

        vscode.postMessage({ type: 'discover-devices' });
    }

    function showDevicesDropdown() {
        const dropdown = document.getElementById('devicesDropdown');

        if (discoveredDevices.length > 0) {
            // Clear existing content safely
            dropdown.innerHTML = '';
            
            discoveredDevices
                .filter(device => device.addresses && device.addresses.length > 0)
                .forEach(device => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'device-option';
                    button.setAttribute('data-host', device.addresses[0]);
                    button.setAttribute('data-name', device.hostname);
                    
                    // Safely set text content
                    button.textContent = device.hostname;
                    
                    const addressSpan = document.createElement('span');
                    addressSpan.className = 'device-option-address';
                    addressSpan.textContent = ` (${device.addresses[0]})`;
                    button.appendChild(addressSpan);
                    
                    // Add click handler
                    button.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const host = this.getAttribute('data-host');
                        const name = this.getAttribute('data-name');
                        document.getElementById('deviceHost').value = host;
                        if (!document.getElementById('deviceName').value) {
                            document.getElementById('deviceName').value = name;
                        }
                        hideDevicesDropdown();
                    });
                    
                    dropdown.appendChild(button);
                });

            dropdown.classList.add('show');
        }
    }

    function hideDevicesDropdown() {
        const dropdown = document.getElementById('devicesDropdown');
        dropdown.classList.remove('show');
    }

    function showFormError(errorMessage) {
        const errorEl = document.getElementById('formError');
        errorEl.textContent = errorMessage;
        errorEl.classList.remove('hidden');
    }

    function hideFormError() {
        const errorEl = document.getElementById('formError');
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'discoveryStarted':
                // Already handled in discoverDevices()
                break;

            case 'discoveryCompleted':
                const btn = document.getElementById('discoverBtn');
                const btnText = document.getElementById('discoverBtnText');
                const spinner = document.getElementById('discoverSpinner');
                const statusEl = document.getElementById('discoveryStatus');

                // Re-enable button
                btn.disabled = false;
                btnText.textContent = 'Discover Devices';
                spinner.classList.add('hidden');

                // Update status
                discoveredDevices = message.devices || [];
                if (discoveredDevices.length > 0) {
                    statusEl.textContent = `Found ${discoveredDevices.length} device(s)`;
                    statusEl.className = 'discovery-status success';
                    showDevicesDropdown();
                } else {
                    statusEl.textContent = 'No devices found';
                    statusEl.className = 'discovery-status';
                }
                break;

            case 'discoveryError':
                const errorBtn = document.getElementById('discoverBtn');
                const errorBtnText = document.getElementById('discoverBtnText');
                const errorSpinner = document.getElementById('discoverSpinner');
                const errorStatusEl = document.getElementById('discoveryStatus');

                // Re-enable button
                errorBtn.disabled = false;
                errorBtnText.textContent = 'Discover Devices';
                errorSpinner.classList.add('hidden');

                // Show error
                errorStatusEl.textContent = message.error || 'Discovery failed';
                errorStatusEl.className = 'discovery-status error';
                break;

            case 'deviceCreated':
            case 'deviceUpdated':
                // Hide the form on success
                hideFormError();
                cancelForm();
                break;

            case 'deviceCreateError':
            case 'deviceUpdateError':
                // Show error message in form
                showFormError(message.error || 'An error occurred');
                break;
        }
    });
})();

