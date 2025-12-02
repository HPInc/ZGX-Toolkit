/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

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

        // Setup buttons
        document.querySelectorAll('[data-action="setup"]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                setupDevice(id);
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

    function setupDevice(id) {
        vscode.postMessage({
            type: 'setup-device',
            id: id
        });
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
