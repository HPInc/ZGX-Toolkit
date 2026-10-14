/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = window.vscodeApi || acquireVsCodeApi();
    window.vscodeApi = vscode;
    const deviceAttentionClasses = [
        'device-attention--connecting',
        'device-attention--checking',
        'device-attention--failed'
    ];
    // Tracks last-applied reachability status per device so an unrelated device's check
    // doesn't replay another device's animation when the store broadcasts every device's status.
    const lastAppliedStatuses = new Map();

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
        initializeReachabilityBaseline();

        // Add device buttons
        const addDeviceBtn = document.getElementById('add-device-btn');
        if (addDeviceBtn) {
            addDeviceBtn.addEventListener('click', showAddForm);
        }

        // Open editor button
        const openEditorBtn = document.getElementById('open-editor-btn');
        if (openEditorBtn) {
            openEditorBtn.addEventListener('click', openEditor);
        }

        // Quick links buttons
        document.querySelectorAll('.quick-links-item').forEach(item => {
            item.addEventListener('click', function() {
                if (item.classList.contains('disabled')) return;
                const link = item.getAttribute('data-link');
                openQuickLink(link);
            });
        });

        // Edit buttons
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                editDevice(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                deleteDevice(id);
            });
        });

        // Connect default buttons
        document.querySelectorAll('[data-action="connect-default"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                connectDevice(id);
            });
        });

        // Connect current window buttons
        document.querySelectorAll('[data-action="connect-current"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                connectDeviceCurrent(id);
            });
        });

        // Connect new window buttons
        document.querySelectorAll('[data-action="connect-new"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                connectDeviceNew(id);
            });
        });

        // Toggle dropdown buttons
        document.querySelectorAll('[data-action="toggle-dropdown"]').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const dropdownId = this.getAttribute('aria-controls');
                toggleDropdown(dropdownId);
            });
        });

        // Manage apps buttons
        document.querySelectorAll('[data-action="manage-apps"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                manageApps(id);
            });
        });

        // Disconnect buttons
        document.querySelectorAll('[data-action="disconnect-device"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                disconnectDevice(id);
            });
        });

        // Check status buttons
        document.querySelectorAll('[data-action="check-device-reachability"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                checkDeviceReachability(id);
            });
        });

        // Register DNS buttons
        document.querySelectorAll('[data-action="register-dns"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                registerDns(id);
            });
        });

        // Setup buttons
        document.querySelectorAll('[data-action="setup"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                setupDevice(id);
            });
        });

        // Section toggle buttons
        document.querySelectorAll('.section-toggle').forEach(btn => {
            btn.addEventListener('click', function() {
                const section = this.getAttribute('data-section');
                toggleSection(section);
            });
        });

        // Section header click (also toggles)
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', function(e) {
                // Don't double-toggle if the toggle button itself was clicked
                if (e.target.closest('.section-toggle')) { return; }
                const section = this.getAttribute('data-section');
                toggleSection(section);
            });
        });

        // Pairing details buttons
        document.querySelectorAll('[data-action="pairing-details"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                vscode.postMessage({
                    type: 'pairing-details',
                    groupId: groupId
                });
            });
        });

        // Unpair devices buttons
        document.querySelectorAll('[data-action="unpair-devices"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                vscode.postMessage({
                    type: 'unpair-devices',
                    groupId: groupId
                });
            });
        });
    });

    window.addEventListener('message', event => {
        if (event.data?.type === 'reachability-status-updated') {
            updateReachabilityAttention(event.data.statuses || []);
        }
    });

    function showAddForm() {
        vscode.postMessage({
            type: 'navigate',
            targetView: 'devices/manager',
            params: { showAddForm: true },
            panel: 'editor'
        });
    }

    function openEditor() {
        vscode.postMessage({
            type: 'navigate',
            targetView: 'devices/manager',
            panel: 'editor'
        });
    }

    function openQuickLink(link) {
        const item = document.querySelector('.quick-links-item[data-link="' + link + '"]');
        const badge = item && item.querySelector('.quick-links-badge');
        if (badge) {
            badge.remove();
        }

        vscode.postMessage({ 
            type: 'quick-links', 
            link: link
        });
    }

    function editDevice(id) {
        vscode.postMessage({
            type: 'navigate',
            targetView: 'devices/manager',
            params: { editDeviceId: id },
            panel: 'editor'
        });
    }

    function deleteDevice(id) {
        vscode.postMessage({
            type: 'delete-device',
            id: id
        });
    }

    function connectDevice(id) {
        setDeviceAttentionById(id, 'connecting');
        vscode.postMessage({
            type: 'connect-device',
            id: id
        });
    }

    function connectDeviceCurrent(id) {
        closeAllDropdowns();
        setDeviceAttentionById(id, 'connecting');
        vscode.postMessage({
            type: 'connect-device',
            id: id,
            newWindow: false
        });
    }

    function connectDeviceNew(id) {
        closeAllDropdowns();
        setDeviceAttentionById(id, 'connecting');
        vscode.postMessage({
            type: 'connect-device',
            id: id,
            newWindow: true
        });
    }

    function manageApps(id) {
        vscode.postMessage({
            type: 'manage-apps',
            id: id
        });
    }

    function disconnectDevice(id) {
        vscode.postMessage({
            type: 'disconnect-device',
            id: id
        });
    }

    function checkDeviceReachability(id) {
        closeAllDropdowns();
        vscode.postMessage({
            type: 'check-device-reachability',
            deviceId: id
        });
    }

    function registerDns(id) {
        vscode.postMessage({
            type: 'register-dns',
            id: id
        });
    }

    function setDeviceAttentionById(deviceId, state) {
        const item = document.querySelector(`.device-item[data-id="${deviceId}"]`);
        if (!item) { return; }

        item.classList.remove(...deviceAttentionClasses);
        if (state === 'failed') {
            void item.offsetWidth;
        }
        if (state) {
            item.classList.add(`device-attention--${state}`);
        }
    }

    function updateReachabilityAttention(statuses) {
        statuses.forEach(status => {
            const previous = lastAppliedStatuses.get(status.deviceId);
            if (previous
                && previous.status === status.status
                && previous.checking === status.checking
                && previous.checkedAt === status.checkedAt
                && previous.explicit === status.explicit) {
                return;
            }
            lastAppliedStatuses.set(status.deviceId, status);

            const item = document.querySelector(`.device-item[data-id="${status.deviceId}"]`);
            if (item) {
                item.classList.toggle('device-item-not-reachable', status.notReachable);
                item.classList.toggle('device-item-unreachable', status.unreachable);
            }

            // Only devices the user explicitly asked to check (tracked server-side, so every
            // view stays in sync regardless of which one initiated the check) should pulse;
            // silent background/periodic reachability checks must not animate the item.
            if (!status.explicit) {
                return;
            }

            if (status.checking) {
                setDeviceAttentionById(status.deviceId, 'checking');
                return;
            }

            setDeviceAttentionById(status.deviceId, status.status === 'unreachable' ? 'failed' : null);
        });
    }

    function initializeReachabilityBaseline() {
        document.querySelectorAll('.device-item[data-device-status]').forEach(item => {
            const checkedAt = item.getAttribute('data-reachability-checked-at') || undefined;
            lastAppliedStatuses.set(item.getAttribute('data-id'), {
                deviceId: item.getAttribute('data-id'),
                status: item.getAttribute('data-device-status'),
                notReachable: item.getAttribute('data-not-reachable') === 'true',
                unreachable: item.getAttribute('data-unreachable') === 'true',
                checking: item.getAttribute('data-reachability-checking') === 'true',
                checkedAt,
                explicit: item.getAttribute('data-reachability-explicit') === 'true'
            });
        });
    }

    function setupDevice(id) {
        vscode.postMessage({
            type: 'setup-device',
            id: id
        });
    }

    /**
     * Toggles a section's visibility and updates the toggle text.
     * @param {string} sectionName - The section identifier ('paired' or 'unpaired').
     */
    function toggleSection(sectionName) {
        const content = document.getElementById('section-' + sectionName);
        const header = document.querySelector('.section-header[data-section="' + sectionName + '"]');
        if (!content || !header) { return; }

        const isCollapsed = content.classList.toggle('collapsed');
        const toggleText = header.querySelector('.section-toggle-text');
        if (toggleText) {
            toggleText.textContent = isCollapsed ? 'Show more' : 'Show less';
        }
        const toggleIcon = header.querySelector('.section-toggle-icon');
        if (toggleIcon) {
            toggleIcon.classList.toggle('codicon-chevron-up', !isCollapsed);
            toggleIcon.classList.toggle('codicon-chevron-down', isCollapsed);
        }
        header.setAttribute('aria-expanded', String(!isCollapsed));
    }

    // Toggle dropdown
    function toggleDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) {return;}

        const isVisible = dropdown.classList.contains('show');
        
        // Close all other dropdowns
        closeAllDropdowns();
        
        // Toggle current dropdown
        if (!isVisible) {
            dropdown.classList.add('show');
            // Add global click listener when dropdown opens
            document.addEventListener('click', handleOutsideClick);
        } else {
            // Remove global click listener when dropdown closes
            document.removeEventListener('click', handleOutsideClick);
        }
    }

    // Close all dropdowns
    function closeAllDropdowns() {
        const dropdowns = document.querySelectorAll('.dropdown-content');
        dropdowns.forEach(d => d.classList.remove('show'));
        // Remove global click listener when all dropdowns are closed
        document.removeEventListener('click', handleOutsideClick);
    }

    function handleOutsideClick(event) {
        const target = event.target;
        if (!target.closest('.split-button') && !target.closest('.dropdown-button')) {
            closeAllDropdowns();
        }
    }
})();

