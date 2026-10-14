/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function () {
    const vscode = window.vscodeApi || acquireVsCodeApi();
    window.vscodeApi = vscode;
    let discoveredDevices = [];
    let hasManuallyEnteredDeviceName = false;
    // Tracks last-applied status per device so periodic reachability ticks only touch the
    // DOM when something actually changed, instead of rewriting every card's markup every
    // few seconds (which causes a distracting reflow/cursor flicker while typing in the form).
    const lastAppliedStatuses = new Map();
    let lastAppliedRefreshText = null;
    const deviceAttentionClasses = [
        'device-attention--connecting',
        'device-attention--checking',
        'device-attention--failed'
    ];

    // Initialize editingDeviceId from data attribute if present
    const formContainer = document.getElementById('addDeviceForm');
    let editingDeviceId = formContainer?.getAttribute('data-editing-id') || null;
    if (editingDeviceId === '') {
        editingDeviceId = null;
    }

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function () {
        initializeReachabilityBaseline();

        // Form submission handler
        const deviceForm = document.getElementById('deviceForm');
        if (deviceForm) {
            deviceForm.addEventListener('submit', handleFormSubmit);
        }

        const deviceNameInput = document.getElementById('deviceName');
        if (deviceNameInput) {
            deviceNameInput.addEventListener('input', function () {
                hasManuallyEnteredDeviceName = this.value.trim().length > 0;
            });
        }

        // Show form button
        const showFormBtn = document.getElementById('showFormBtn');
        if (showFormBtn) {
            showFormBtn.addEventListener('click', showAddForm);
        }

        // Pair Devices button
        const pairDevicesBtn = document.getElementById('pairDevicesBtn');
        if (pairDevicesBtn) {
            pairDevicesBtn.addEventListener('click', function() {
                vscode.postMessage({
                    type: 'navigate',
                    targetView: 'groups/pairDevices',
                    panel: 'editor'
                });
            });
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

        // Refresh Status button
        const refreshStatusBtn = document.getElementById('refreshStatusBtn');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', refreshDeviceStatus);
        }

        // Edit buttons
        document.querySelectorAll('.edit-icon').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                showEditForm(deviceId);
            });
        });

        // DNS warning icon buttons
        document.querySelectorAll('.dns-warning-icon').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'register-dns',
                    id: deviceId
                });
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
                setDeviceAttentionById(deviceId, 'connecting');
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

                if (action === 'disconnect-device') {
                    vscode.postMessage({
                        type: 'disconnect-device',
                        id: id
                    });
                } else if (action === 'check-device-reachability') {
                    vscode.postMessage({
                        type: 'check-device-reachability',
                        deviceId: id
                    });
                } else {
                    setDeviceAttentionById(id, 'connecting');
                    vscode.postMessage({
                        type: 'connect-device',
                        id: id,
                        newWindow: action === 'new'
                    });
                }

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

        // Disconnect buttons
        document.querySelectorAll('.disconnect-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const deviceId = this.getAttribute('data-id');
                vscode.postMessage({
                    type: 'disconnect-device',
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

        // Pairing details link buttons
        document.querySelectorAll('[data-action="pairing-details"]').forEach(btn => {
            btn.addEventListener('click', function () {
                const groupId = this.getAttribute('data-group-id');
                vscode.postMessage({
                    type: 'pairing-details',
                    groupId: groupId
                });
            });
        });

        // Unpair devices link buttons
        document.querySelectorAll('[data-action="unpair-devices"]').forEach(btn => {
            btn.addEventListener('click', function () {
                const groupId = this.getAttribute('data-group-id');
                vscode.postMessage({
                    type: 'unpair-devices',
                    groupId: groupId
                });
            });
        });


        // Keep submit button/hint in sync as the user changes it
        const deviceTypeSelectEl = document.getElementById('deviceType');
        if (deviceTypeSelectEl) {
            deviceTypeSelectEl.addEventListener('change', updateDeviceTypeValidation);
        }

        // In case the page loads directly into edit mode, sync the initial state
        updateDeviceTypeValidation();

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
            port: parseInt(document.getElementById('devicePort').value)
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
            const deviceTypeSelect = document.getElementById('deviceType');
            const deviceType = deviceTypeSelect ? deviceTypeSelect.value : '';

            if (!deviceType) {
                // The submit button should already be disabled in this state,
                // but placing guard here in case the button state is stale.
                updateDeviceTypeValidation();
                vscode.postMessage({
                    type: 'show-error',
                    message: 'Please select a device type.'
                });
                return;
            }

            device.fingerprint = { deviceType };

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
        vscode.postMessage({ type: 'device-form-state', mode: 'add' });
        document.getElementById('addDeviceForm').classList.remove('hidden');
        document.getElementById('showFormBtn').classList.add('hidden');
        document.getElementById('formTitle').textContent = 'Add New Device';
        document.getElementById('submitBtn').textContent = 'Add Device';

        // Device type is only editable when updating an existing device
        const deviceTypeGroup = document.getElementById('deviceTypeGroup');
        if (deviceTypeGroup) {
            deviceTypeGroup.classList.add('hidden');
        }

        // Not editing, so the device-type requirement doesn't apply
        updateDeviceTypeValidation();

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
        const dnsInstanceName = deviceCard.getAttribute('data-dns-instance-name') || '';
        const deviceType = deviceCard.getAttribute('data-device-type') || '';

        // Set editing state
        editingDeviceId = deviceId;
        vscode.postMessage({ type: 'device-form-state', mode: 'edit', deviceId });

        // Populate form fields
        document.getElementById('deviceName').value = name;
        document.getElementById('deviceHost').value = host;
        document.getElementById('deviceUsername').value = username;
        document.getElementById('devicePort').value = port;

        // Show and populate the device type selector (only relevant while editing)
        const deviceTypeGroup = document.getElementById('deviceTypeGroup');
        const deviceTypeSelect = document.getElementById('deviceType');
        if (deviceTypeGroup && deviceTypeSelect) {
            deviceTypeGroup.classList.remove('hidden');
            deviceTypeSelect.value = deviceType;
            // If the device's current type isn't a selectable option (e.g. 'pending' or
            // 'unknown'), fall back to the placeholder so the user must make a choice.
            if (deviceTypeSelect.selectedIndex === -1) {
                deviceTypeSelect.value = '';
            }
        }

        // Update discover button for this device
        const discoverBtn = document.getElementById('discoverBtn');
        const discoverBtnText = document.getElementById('discoverBtnText');
        if (discoverBtn && discoverBtnText) {
            discoverBtn.setAttribute('data-dns-instance-name', dnsInstanceName);
            discoverBtnText.textContent = dnsInstanceName ? 'Rediscover Device' : 'Discover Devices';
        }

        // Clear any previous error
        hideFormError();

        // Sync submit button/hint with the (now populated) device type value
        updateDeviceTypeValidation();

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
        vscode.postMessage({ type: 'device-form-state', mode: 'closed' });
        document.getElementById('addDeviceForm').classList.add('hidden');
        document.getElementById('showFormBtn').classList.remove('hidden');
    }

    function resetForm() {
        // Explicitly clearing each field
        document.getElementById('deviceForm').reset();
        hasManuallyEnteredDeviceName = false;
        document.getElementById('deviceName').value = '';
        document.getElementById('deviceHost').value = '';
        document.getElementById('deviceUsername').value = '';
        document.getElementById('devicePort').value = '22';
        const deviceTypeSelect = document.getElementById('deviceType');
        if (deviceTypeSelect) {
            deviceTypeSelect.value = '';
        }
        hideFormError();
        hideDiscoveryErrorCard();

        // Reset discover button to default state (no DNS instance name)
        const discoverBtn = document.getElementById('discoverBtn');
        const discoverBtnText = document.getElementById('discoverBtnText');
        if (discoverBtn && discoverBtnText) {
            discoverBtn.setAttribute('data-dns-instance-name', '');
            discoverBtnText.textContent = 'Discover Devices';
        }

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

    function refreshDeviceStatus() {
        const btn = document.getElementById('refreshStatusBtn');
        const btnText = document.getElementById('refreshStatusBtnText');
        const spinner = document.getElementById('refreshStatusSpinner');

        btn.disabled = true;
        btnText.textContent = 'Refreshing...';
        spinner.classList.remove('hidden');

        vscode.postMessage({ type: 'refresh-all-reachability' });
    }

    function discoverDevices() {
        const btn = document.getElementById('discoverBtn');
        const btnText = document.getElementById('discoverBtnText');
        const spinner = document.getElementById('discoverSpinner');
        const statusEl = document.getElementById('discoveryStatus');
        const dnsInstanceName = btn.getAttribute('data-dns-instance-name');

        // Check if we're editing a device with a DNS instance name (use module-level editingDeviceId)
        const isEditingWithDns = editingDeviceId && dnsInstanceName && dnsInstanceName !== '';

        // Hide any previous error card and stale discovery results
        hideDiscoveryErrorCard();
        hideDevicesDropdown();
        discoveredDevices = [];
        document.getElementById('devicesDropdown').innerHTML = '';

        // Disable button and show spinner
        btn.disabled = true;
        btnText.textContent = isEditingWithDns ? 'Rediscovering...' : 'Discovering...';
        spinner.classList.remove('hidden');

        // Show status
        statusEl.classList.remove('hidden');
        statusEl.textContent = isEditingWithDns ? 'Searching for device...' : 'Searching for devices...';
        statusEl.className = 'discovery-status';

        if (isEditingWithDns) {
            // Rediscover specific device
            vscode.postMessage({ 
                type: 'rediscover-device',
                deviceId: editingDeviceId,
                dnsInstanceName: dnsInstanceName
            });
        } else {
            // Full device discovery
            vscode.postMessage({ type: 'discover-devices' });
        }
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
                        if (!hasManuallyEnteredDeviceName) {
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

    function updateDiscoveryErrorCard(title, code) {
        const titleEl = document.querySelector('#discoveryErrorCard .discovery-error-title');
        const codeEl = document.getElementById('discoveryErrorCode');
        const codeValueEl = document.getElementById('discoveryErrorCodeValue');

        if (titleEl) {
            titleEl.textContent = title || 'Discovery failed.';
        }

        if (!codeEl || !codeValueEl) {
            return;
        }

        if (code) {
            codeValueEl.textContent = code.startsWith('#') ? code : `#${code}`;
            codeEl.classList.remove('hidden');
            return;
        }

        codeValueEl.textContent = '';
        codeEl.classList.add('hidden');
    }

    function showDiscoveryErrorCard() {
        const card = document.getElementById('discoveryErrorCard');
        if (card) {
            card.classList.remove('hidden');
        }
    }

    function hideDiscoveryErrorCard() {
        const card = document.getElementById('discoveryErrorCard');
        if (card) {
            card.classList.add('hidden');
        }
    }

    /**
     * When editing an existing device, a device type must be selected before the
     * device can be updated. Disable the submit button and show an inline hint
     * until a valid selection is made.
     */
    function updateDeviceTypeValidation() {
        const submitBtn = document.getElementById('submitBtn');
        const deviceTypeSelect = document.getElementById('deviceType');
        const deviceTypeHint = document.getElementById('deviceTypeHint');

        if (!submitBtn) {
            return;
        }

        const requiresDeviceType = !!editingDeviceId;
        const isMissingDeviceType = requiresDeviceType && deviceTypeSelect && !deviceTypeSelect.value;

        submitBtn.disabled = !!isMissingDeviceType;

        if (deviceTypeHint) {
            deviceTypeHint.classList.toggle('hidden', !isMissingDeviceType);
        }
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

            case 'discoveryCompleted': {
                const btn = document.getElementById('discoverBtn');
                const btnText = document.getElementById('discoverBtnText');
                const spinner = document.getElementById('discoverSpinner');
                const statusEl = document.getElementById('discoveryStatus');
                const dnsInstanceName = btn.getAttribute('data-dns-instance-name');
                // Use module-level editingDeviceId instead of reading from DOM
                const isEditingWithDns = editingDeviceId && dnsInstanceName && dnsInstanceName !== '';

                // Re-enable button
                btn.disabled = false;
                btnText.textContent = isEditingWithDns ? 'Rediscover Device' : 'Discover Devices';
                spinner.classList.add('hidden');

                // Update status
                discoveredDevices = message.devices || [];
                if (discoveredDevices.length > 0) {
                    statusEl.textContent = `Found ${discoveredDevices.length} device(s)`;
                    statusEl.className = 'discovery-status success';
                    showDevicesDropdown();
                } else {
                    statusEl.classList.add('hidden');
                    statusEl.textContent = '';
                    statusEl.className = 'discovery-status hidden';
                    updateDiscoveryErrorCard(message.emptyStateTitle || 'No devices found.', message.emptyStateCode);
                    showDiscoveryErrorCard();
                }
                break;
            }

            case 'discoveryError': {
                const errorBtn = document.getElementById('discoverBtn');
                const errorBtnText = document.getElementById('discoverBtnText');
                const errorSpinner = document.getElementById('discoverSpinner');
                const errorStatusEl = document.getElementById('discoveryStatus');
                const errorDnsInstanceName = errorBtn.getAttribute('data-dns-instance-name');
                // Use module-level editingDeviceId instead of reading from DOM
                const isEditingWithDnsError = editingDeviceId && errorDnsInstanceName && errorDnsInstanceName !== '';

                // Re-enable button
                errorBtn.disabled = false;
                errorBtnText.textContent = isEditingWithDnsError ? 'Rediscover Device' : 'Discover Devices';
                errorSpinner.classList.add('hidden');

                // Show error card instead of inline status text
                errorStatusEl.classList.add('hidden');
                errorStatusEl.textContent = '';
                errorStatusEl.className = 'discovery-status hidden';
                updateDiscoveryErrorCard(message.errorTitle || 'Discovery failed.', message.errorCode);
                showDiscoveryErrorCard();
                break;
            }

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

            case 'show-paired-delete-warning':
                showPairedDeleteWarning(message.deviceId, message.deviceName, message.groupId);
                break;

            case 'show-password-input-for-delete':
                showPasswordInputForDelete(message.deviceId, message.groupId, message.deviceIds, message.deviceNames);
                break;

            case 'show-zrt-announcement':
                showZrtAnnouncement(message.zrtLogoUri);
                break;

            case 'show-zrt-info':
                showZrtInfoModal(message.zrtLogoUri);
                break;

            case 'reachability-status-updated':
                updateReachabilityStatus(message);
                break;

            case 'reachability-refresh-completed': {
                const refreshBtn = document.getElementById('refreshStatusBtn');
                const refreshBtnText = document.getElementById('refreshStatusBtnText');
                const refreshSpinner = document.getElementById('refreshStatusSpinner');
                if (refreshBtn && refreshBtnText && refreshSpinner) {
                    refreshBtn.disabled = false;
                    refreshBtnText.textContent = 'Refresh Status';
                    refreshSpinner.classList.add('hidden');
                }
                break;
            }
        }
    });

    function updateReachabilityStatus(message) {
        (message.statuses || []).forEach(status => {
            const previous = lastAppliedStatuses.get(status.deviceId);
            if (previous
                && previous.status === status.status
                && previous.label === status.label
                && previous.notReachable === status.notReachable
                && previous.unreachable === status.unreachable
                && previous.checking === status.checking
                && previous.checkedAt === status.checkedAt
                && previous.explicit === status.explicit) {
                return;
            }
            lastAppliedStatuses.set(status.deviceId, status);

            const card = document.querySelector(`.device-card[data-id="${status.deviceId}"]`);
            if (!card) {
                return;
            }

            card.classList.toggle('device-card-not-reachable', status.notReachable);
            card.classList.toggle('device-card-unreachable', status.unreachable);
            // Only devices the user explicitly asked to check (tracked server-side, so every
            // view stays in sync regardless of which one initiated the check) should pulse;
            // silent background/periodic reachability checks must not animate the card.
            if (status.explicit) {
                if (status.checking) {
                    setDeviceAttention(card, 'checking');
                } else {
                    setDeviceAttention(card, status.status === 'unreachable' ? 'failed' : null);
                }
            }

            const statusElement = card.querySelector('[data-device-status]');
            if (!statusElement) {
                return;
            }

            statusElement.className = `device-status device-status-${status.status}`;
            const label = statusElement.querySelector('[data-device-status-label]');
            if (label) {
                label.textContent = status.label;
            }
        });

        const lastRefreshedText = `Last refreshed: ${message.lastRefreshed}`;
        if (lastRefreshedText !== lastAppliedRefreshText) {
            lastAppliedRefreshText = lastRefreshedText;
            const lastRefreshed = document.getElementById('lastRefreshed');
            if (lastRefreshed) {
                lastRefreshed.textContent = lastRefreshedText;
            }
        }
    }

    function setDeviceAttentionById(deviceId, state) {
        const card = document.querySelector(`.device-card[data-id="${deviceId}"]`);
        if (card) {
            setDeviceAttention(card, state);
        }
    }

    function setDeviceAttention(card, state) {
        card.classList.remove(...deviceAttentionClasses);
        if (state === 'failed') {
            void card.offsetWidth;
        }
        if (state) {
            card.classList.add(`device-attention--${state}`);
        }
    }

    function initializeReachabilityBaseline() {
        document.querySelectorAll('.device-card[data-device-status]').forEach(card => {
            const checkedAt = card.getAttribute('data-reachability-checked-at') || undefined;
            lastAppliedStatuses.set(card.getAttribute('data-id'), {
                deviceId: card.getAttribute('data-id'),
                status: card.getAttribute('data-device-status'),
                label: card.getAttribute('data-device-status-label'),
                notReachable: card.getAttribute('data-not-reachable') === 'true',
                unreachable: card.getAttribute('data-unreachable') === 'true',
                checking: card.getAttribute('data-reachability-checking') === 'true',
                checkedAt,
                explicit: card.getAttribute('data-reachability-explicit') === 'true'
            });
        });
    }

    /**
     * Show the one-time ZRT product announcement overlay.
     * @param {string} [zrtLogoUri] - Webview URI for the ZRT logo image to use as the overlay icon.
     */
    function showZrtAnnouncement(zrtLogoUri) {
        if (!window.showAnnouncementOverlay) {
            return;
        }
        window.showAnnouncementOverlay(
            'Introducing HP Z Runtime',
            '\n**Take the next step with your AI workflow**\nYou\'ve connected to your AI infrastructure with HP Z Toolkit. Now use HP Z Runtime (ZRT) to pull, serve, and manage AI models locally through a streamlined runtime designed for supported devices.\n\n**To install ZRT:**\n1. Select a device from **Device Manager**.\n2. Click **Manage Apps**.\n3. Under **Model Serving**, select *HP Z Runtime* and **install**.',
            {
                dismissText: 'Dismiss',
                learnMoreText: 'Learn More',
                learnMoreIsPrimary: true,
                iconImageUri: zrtLogoUri,
                onDismiss: function() {
                    vscode.postMessage({ type: 'zrt-announcement-dismiss' });
                },
                onLearnMore: function() {
                    vscode.postMessage({ type: 'zrt-announcement-learn-more' });
                }
            }
        );
    }

    /**
     * Show the ZRT info modal triggered from the corresponding Quick Links entry.
     * @param {string} [zrtLogoUri] - Webview URI for the ZRT logo image to use as the overlay icon.
     */
    function showZrtInfoModal(zrtLogoUri) {
        if (!window.showAnnouncementOverlay) {
            return;
        }
        window.showAnnouncementOverlay(
            'HP Z Runtime',
            '**What is HP Z Runtime?**\n\nHP Z Runtime (ZRT) is a command-line runtime for pulling, serving, and managing large language models locally on supported HP Z devices, with OpenAI-compatible API endpoints for inference.\n\n**Key benefits**\n- Pull and run models from popular model hubs\n- Serve models locally with a single command\n- Streamlined model lifecycle management\n- OpenAI-compatible API endpoints for easy integration\n\n**How to install**\n1. Select a device from **Device Manager**.\n2. Click **Manage Apps**.\n3. Under **Model Serving**, select **HP Z Runtime** and **install**.\n\nZRT is distributed as a Snap package and is installed automatically through the Manage Apps flow above.',
            {
                dismissText: 'Close',
                learnMoreText: 'Learn More',
                learnMoreIsPrimary: true,
                iconImageUri: zrtLogoUri,
                onDismiss: function() {
                    vscode.postMessage({ type: 'zrt-info-close' });
                },
                onLearnMore: function() {
                    vscode.postMessage({ type: 'zrt-info-learn-more' });
                }
            }
        );
    }

    /**
     * Show warning overlay when user tries to delete a paired device.
     * @param {string} deviceId - The ID of the device to delete.
     * @param {string} deviceName - The display name of the device.
     * @param {string} groupId - The ID of the paired group the device belongs to.
     */
    function showPairedDeleteWarning(deviceId, deviceName, groupId) {
        if (!window.showWarningOverlay) {
            // Fallback: send confirm message directly if warning overlay is not available
            vscode.postMessage({ type: 'confirm-delete-paired-device', id: deviceId, groupId: groupId });
            return;
        }
        window.showWarningOverlay(
            'Unpair and Delete Device',
            '**' + deviceName + '** is currently paired with another device.\nContinuing will result in:\n- both devices in the pair will be unpaired\n- the paired group will be removed from all of your views\n- **' + deviceName + '** will be permanently **deleted** from your HP Z Toolkit device list\n\nDo you want to continue?',
            {
                continueText: 'Unpair and Delete Device',
                cancelText: 'Cancel',
                iconColor: 'var(--vscode-errorForeground)',
                hideMessageContainer: true,
                listIndent: '32px',
                firstLineFontSize: '17px',
                colorWords: [{ word: 'deleted', color: 'var(--vscode-errorForeground)' }],
                onContinue: function() {
                    vscode.postMessage({ type: 'confirm-delete-paired-device', id: deviceId, groupId: groupId });
                }
            }
        );
    }

    /**
     * Show password input overlay to collect sudo password for paired device deletion.
     * @param {string} deviceId - The ID of the device to delete.
     * @param {string} groupId - The ID of the paired group the device belongs to.
     * @param {string[]} deviceIds - The IDs of devices being unconfigured.
     * @param {string[]} deviceNames - The display names of devices being unconfigured.
     */
    function showPasswordInputForDelete(deviceId, groupId, deviceIds, deviceNames) {
        if (!window.showPasswordInputOverlay) {
            return;
        }
        window.showPasswordInputOverlay({
            title: 'Sudo Passwords Required',
            message: 'Enter your sudo password for each device to complete the unpairing.',
            messageEmphasis: 'Devices may use different sudo passwords.',
            icon: 'codicon-lock',
            devices: deviceIds.map(function(currentDeviceId, index) {
                return { id: currentDeviceId, name: deviceNames[index] };
            }),
            placeholder: 'Enter password...',
            hint: 'The passwords are only used to remove the ConnectX network settings required for pairing.',
            submitButtonText: 'Continue',
            cancelButtonText: 'Cancel',
            validationErrorMessage: 'Password is required',
            onSubmit: function(passwords) {
                vscode.postMessage({
                    type: 'password-submitted-for-delete',
                    passwords: passwords,
                    deviceId: deviceId,
                    groupId: groupId
                });
            },
            onCancel: function() {
                vscode.postMessage({
                    type: 'password-input-cancelled-for-delete',
                    deviceId: deviceId
                });
            }
        });
    }
})();

