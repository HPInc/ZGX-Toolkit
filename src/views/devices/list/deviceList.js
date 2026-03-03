/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = window.vscodeApi || acquireVsCodeApi();
    window.vscodeApi = vscode;

    // Set up event listeners instead of inline onclick
    document.addEventListener('DOMContentLoaded', function() {
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
                const id = this.getAttribute('data-id');
                toggleDropdown(id);
            });
        });

        // Manage apps buttons
        document.querySelectorAll('[data-action="manage-apps"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                manageApps(id);
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

        // Paired group container toggle (collapse/expand)
        document.querySelectorAll('.sidebar-paired-group-container').forEach(container => {
            container.addEventListener('click', function(e) {
                // Don't toggle when clicking interactive elements inside the container
                const target = e.target;
                if (target.closest('button') || target.closest('a') || target.closest('.split-button')) {
                    return;
                }
                this.classList.toggle('collapsed');
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
        vscode.postMessage({
            type: 'connect-device',
            id: id
        });
    }

    function connectDeviceCurrent(id) {
        closeAllDropdowns();
        vscode.postMessage({
            type: 'connect-device',
            id: id,
            newWindow: false
        });
    }

    function connectDeviceNew(id) {
        closeAllDropdowns();
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

    function registerDns(id) {
        vscode.postMessage({
            type: 'register-dns',
            id: id
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
        header.setAttribute('aria-expanded', String(!isCollapsed));
    }

    // Toggle dropdown
    function toggleDropdown(deviceId) {
        const dropdown = document.getElementById('dropdown-' + deviceId);
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
