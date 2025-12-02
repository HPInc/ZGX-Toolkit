/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();
    
    // These will be initialized by the view
    let selectedAppsToInstall = [];
    let selectedAppsToUninstall = [];
    let installedApps = [];
    let deviceId = '';
    let appDefinitions = [];
    let autoDependencies = new Set();
    
    /**
     * Initialize the app selection view with data
     * This is called from the initialization script injected by the view
     */
    window.initAppSelection = function(data) {
        selectedAppsToInstall = [];
        selectedAppsToUninstall = [];
        installedApps = data.installedApps || [];
        deviceId = data.deviceId;
        appDefinitions = data.appDefinitions || [];
        autoDependencies = new Set();
        
        // Update UI based on initial state
        updateButtonStates();
    };
    
    /**
     * Get app definition by ID
     */
    function getAppById(appId) {
        return appDefinitions.find(app => app.id === appId);
    }
    
    /**
     * Check if an app is installed
     */
    function isInstalled(appId) {
        return installedApps.includes(appId);
    }
    
    /**
     * Add dependencies for a non-installed app (recursive)
     */
    function addInstallDependencies(appId) {
        const app = getAppById(appId);
        if (app && app.dependencies) {
            for (const depId of app.dependencies) {
                if (!isInstalled(depId)) {
                    if (!selectedAppsToInstall.includes(depId)) {
                        // Dependency not yet selected, add it
                        selectedAppsToInstall.push(depId);
                        autoDependencies.add(depId);
                        updateAppVisual(depId);
                        addInstallDependencies(depId);
                    } else {
                        // Dependency already selected, mark it as auto-dependency
                        autoDependencies.add(depId);
                        updateAppVisual(depId);
                    }
                }
            }
        }
    }
    
    /**
     * Add dependents for an installed app (recursive)
     */
    function addUninstallDependents(appId) {
        const dependents = appDefinitions.filter(app => 
            app.dependencies && app.dependencies.includes(appId) && isInstalled(app.id)
        );
        
        for (const dependent of dependents) {
            if (!selectedAppsToUninstall.includes(dependent.id)) {
                // Dependent not yet selected, add it
                selectedAppsToUninstall.push(dependent.id);
                autoDependencies.add(dependent.id);
                updateAppVisual(dependent.id);
                addUninstallDependents(dependent.id);
            } else {
                // Dependent already selected, mark it as auto-dependency
                autoDependencies.add(dependent.id);
                updateAppVisual(dependent.id);
            }
        }
    }
    
    /**
     * Remove install dependencies that are no longer needed
     */
    function removeInstallDependencies(appId) {
        const app = getAppById(appId);
        if (app && app.dependencies) {
            for (const depId of app.dependencies) {
                if (depId === 'base-system') continue;
                
                const stillNeeded = selectedAppsToInstall.some(selectedId => {
                    if (selectedId === appId) return false;
                    const selectedApp = getAppById(selectedId);
                    return selectedApp && selectedApp.dependencies && selectedApp.dependencies.includes(depId);
                });
                
                if (!stillNeeded && autoDependencies.has(depId)) {
                    const index = selectedAppsToInstall.indexOf(depId);
                    if (index > -1) {
                        selectedAppsToInstall.splice(index, 1);
                        autoDependencies.delete(depId);
                        updateAppVisual(depId);
                        removeInstallDependencies(depId);
                    }
                }
            }
        }
    }
    
    /**
     * Remove uninstall dependents that are no longer needed
     */
    function removeUninstallDependents(appId) {
        const dependents = appDefinitions.filter(app => 
            app.dependencies && app.dependencies.includes(appId) && 
            selectedAppsToUninstall.includes(app.id)
        );
        
        for (const dependent of dependents) {
            if (autoDependencies.has(dependent.id)) {
                const index = selectedAppsToUninstall.indexOf(dependent.id);
                if (index > -1) {
                    selectedAppsToUninstall.splice(index, 1);
                    autoDependencies.delete(dependent.id);
                    updateAppVisual(dependent.id);
                    removeUninstallDependents(dependent.id);
                }
            }
        }
    }
    
    /**
     * Add or update the checkmark on an app widget
     */
    function updateCheckmark(widget, isAutoDep) {
        if (!widget.querySelector('.checkmark')) {
            const checkmark = document.createElement('div');
            checkmark.className = isAutoDep ? 'checkmark checkmark-auto' : 'checkmark';
            checkmark.textContent = '✓';
            widget.appendChild(checkmark);
        } else {
            const checkmark = widget.querySelector('.checkmark');
            if (isAutoDep) {
                checkmark.classList.add('checkmark-auto');
            } else {
                checkmark.classList.remove('checkmark-auto');
            }
        }
    }
    
    /**
     * Update the visual appearance of an app widget
     */
    function updateAppVisual(appId) {
        const widget = document.querySelector(`[data-app-id="${appId}"]`);
        if (!widget) return;
        
        const isSelected = selectedAppsToInstall.includes(appId) || selectedAppsToUninstall.includes(appId);
        const isAutoDep = autoDependencies.has(appId);
        const isUninstallMode = selectedAppsToUninstall.length > 0;
        
        if (isSelected) {
            widget.classList.add('app-selected');
            
            // Add checkmark
            updateCheckmark(widget, isAutoDep);
            
            // Add/update dependency badge
            if (isAutoDep) {
                widget.classList.add('app-auto-dependency');
                if (!widget.querySelector('.dependency-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'dependency-badge';
                    // Use different text based on context
                    badge.textContent = isUninstallMode ? 'Dependent' : 'Required';
                    badge.title = isUninstallMode 
                        ? 'Automatically selected for uninstallation because it depends on another selected app'
                        : 'Automatically selected for installation as a dependency';
                    widget.appendChild(badge);
                } else {
                    // Update existing badge text in case mode changed
                    const badge = widget.querySelector('.dependency-badge');
                    badge.textContent = isUninstallMode ? 'Dependent' : 'Required';
                    badge.title = isUninstallMode 
                        ? 'Automatically selected for uninstallation because it depends on another selected app'
                        : 'Automatically selected for installation as a dependency';
                }
            } else {
                widget.classList.remove('app-auto-dependency');
                const badge = widget.querySelector('.dependency-badge');
                if (badge) {
                    badge.remove();
                }
            }
        } else {
            widget.classList.remove('app-selected', 'app-auto-dependency');
            const checkmark = widget.querySelector('.checkmark');
            if (checkmark) {
                checkmark.remove();
            }
            const badge = widget.querySelector('.dependency-badge');
            if (badge) {
                badge.remove();
            }
        }
    }
    
    /**
     * Clear all selections
     */
    function clearSelections() {
        // Store the current selections before clearing
        const appsToUpdate = [...selectedAppsToInstall, ...selectedAppsToUninstall];
        
        // Clear the arrays first
        selectedAppsToInstall = [];
        selectedAppsToUninstall = [];
        autoDependencies.clear();
        
        // Now update visuals for all previously selected apps
        appsToUpdate.forEach(appId => {
            updateAppVisual(appId);
        });
    }
    
    /**
     * Update button states and status message
     */
    function updateButtonStates() {
        const installBtn = document.getElementById('install-btn');
        const uninstallBtn = document.getElementById('uninstall-btn');
        const statusEl = document.getElementById('selection-status');
        
        const hasInstallSelection = selectedAppsToInstall.length > 0;
        const hasUninstallSelection = selectedAppsToUninstall.length > 0;
        
        installBtn.disabled = !hasInstallSelection;
        uninstallBtn.disabled = !hasUninstallSelection;
        
        if (hasInstallSelection) {
            statusEl.textContent = `${selectedAppsToInstall.length} application${selectedAppsToInstall.length !== 1 ? 's' : ''} selected for installation`;
        } else if (hasUninstallSelection) {
            statusEl.textContent = `${selectedAppsToUninstall.length} application${selectedAppsToUninstall.length !== 1 ? 's' : ''} selected for uninstallation`;
        } else {
            statusEl.textContent = 'No applications selected. Click on application cards to select them.';
        }
        
        updateUninstallAllButton();
    }
    
    /**
     * Update the uninstall all button state
     */
    function updateUninstallAllButton() {
        const uninstallAllBtn = document.getElementById('uninstall-all-btn');
        const hasUninstallableApps = installedApps.filter(id => id !== 'base-system').length > 0;
        uninstallAllBtn.disabled = !hasUninstallableApps;
    }
    
    /**
     * Toggle selection of an app
     */
    function toggleApp(appId) {
        const app = getAppById(appId);
        if (!app) return;
        
        const installed = isInstalled(appId);
        
        if (installed) {
            // Selecting an installed app for uninstallation
            
            // Can't uninstall base-system
            if (appId === 'base-system') {
                return; // Silently ignore clicks on base-system
            }
            
            // If we have install selections, clear them and switch to uninstall mode
            if (selectedAppsToInstall.length > 0) {
                clearSelections();
            }
            
            const index = selectedAppsToUninstall.indexOf(appId);
            if (index === -1) {
                // Select for uninstallation
                selectedAppsToUninstall.push(appId);
                autoDependencies.delete(appId); // User-selected, not auto
                updateAppVisual(appId);
                
                // Add all apps that depend on this one
                addUninstallDependents(appId);
            } else {
                // Deselect from uninstallation
                
                // Can't deselect if it's a required dependency
                if (autoDependencies.has(appId)) {
                    return;
                }
                
                selectedAppsToUninstall.splice(index, 1);
                autoDependencies.delete(appId);
                updateAppVisual(appId);
                
                // Remove dependents
                removeUninstallDependents(appId);
            }
        } else {
            // Selecting a non-installed app for installation
            
            // If we have uninstall selections, clear them and switch to install mode
            if (selectedAppsToUninstall.length > 0) {
                clearSelections();
            }
            
            const index = selectedAppsToInstall.indexOf(appId);
            if (index === -1) {
                // Select for installation
                selectedAppsToInstall.push(appId);
                autoDependencies.delete(appId); // User-selected, not auto
                updateAppVisual(appId);
                
                // Add all dependencies
                addInstallDependencies(appId);
                
                // Ensure base-system is selected if not installed
                if (!isInstalled('base-system') && !selectedAppsToInstall.includes('base-system')) {
                    selectedAppsToInstall.push('base-system');
                    autoDependencies.add('base-system');
                    updateAppVisual('base-system');
                }
            } else {
                // Deselect from installation
                if (appId === 'base-system') {
                    return;
                }
                
                // Can't deselect if it's a required dependency
                if (autoDependencies.has(appId)) {
                    return;
                }
                
                selectedAppsToInstall.splice(index, 1);
                autoDependencies.delete(appId);
                updateAppVisual(appId);
                
                // Remove dependencies
                removeInstallDependencies(appId);
            }
        }
        
        updateButtonStates();
    }
    
    /**
     * Initialize event handlers after DOM is loaded
     */
    document.addEventListener('DOMContentLoaded', function() {
        const installBtn = document.getElementById('install-btn');
        const uninstallBtn = document.getElementById('uninstall-btn');
        const continueInferenceBtn = document.getElementById('continue-inference-btn');
        const closeBtn = document.getElementById('close-btn');
        const uninstallAllBtn = document.getElementById('uninstall-all-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        
        if (installBtn) {
            installBtn.addEventListener('click', function() {
                if (selectedAppsToInstall.length > 0) {
                    vscode.postMessage({ 
                        type: 'install-apps', 
                        selectedApps: selectedAppsToInstall,
                        deviceId: deviceId
                    });
                }
            });
        }
        
        if (uninstallBtn) {
            uninstallBtn.addEventListener('click', function() {
                if (selectedAppsToUninstall.length > 0) {
                    vscode.postMessage({ 
                        type: 'uninstall-apps', 
                        selectedApps: selectedAppsToUninstall,
                        deviceId: deviceId
                    });
                }
            });
        }
        
        if (continueInferenceBtn) {
            continueInferenceBtn.addEventListener('click', function() {
                // Only proceed if button is enabled
                if (!continueInferenceBtn.disabled) {
                    vscode.postMessage({ 
                        type: 'continue-to-inference',
                        deviceId: deviceId
                    });
                }
            });
            
            // Mark button as loading and send message to check installation status
            continueInferenceBtn.classList.add('loading');
            
            vscode.postMessage({
                type: 'check-ollama',
                deviceId: deviceId
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'cancel' });
            });
        }
        
        if (uninstallAllBtn) {
            uninstallAllBtn.addEventListener('click', function() {
                vscode.postMessage({ 
                    type: 'uninstall-all',
                    deviceId: deviceId
                });
            });
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                handleRefresh();
            });
        }

        handleRefresh(); // Start refreshing app installs
        
        // Add click listeners to app widgets
        document.addEventListener('click', function(e) {
            const widget = e.target.closest('.app-widget');
            if (widget) {
                toggleApp(widget.dataset.appId);
            }
        });
    });
    
    /**
     * Handle refresh button click
     */
    function handleRefresh() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (!refreshBtn) return;
        
        // Disable button and update UI
        refreshBtn.disabled = true;
        refreshBtn.classList.add('refreshing');
        const refreshText = refreshBtn.querySelector('.refresh-text');
        if (refreshText) {
            refreshText.textContent = 'Refreshing...';
        }
        
        // Add verifying state to all app cards
        const allAppIds = appDefinitions.map(app => app.id);
        allAppIds.forEach(appId => {
            const widget = document.querySelector(`[data-app-id="${appId}"]`);
            if (widget) {
                widget.classList.add('app-verifying');
                
                // Hide installed badge if present
                const installedBadge = widget.querySelector('.installed-badge');
                if (installedBadge) {
                    installedBadge.style.display = 'none';
                }
                
                // Add verification badge
                const existingBadge = widget.querySelector('.verification-badge');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.className = 'verification-badge badge-verifying';
                    badge.innerHTML = '<div class="badge-spinner"></div><span>Verifying...</span>';
                    widget.appendChild(badge);
                }
            }
        });
        
        // Send message to backend to verify all apps
        vscode.postMessage({
            type: 'verify-installations',
            deviceId: deviceId,
            appIds: allAppIds
        });
    }
    
    /**
     * Handle verification result from backend
     */
    function handleVerificationResult(appId, isInstalled) {
        const widget = document.querySelector(`[data-app-id="${appId}"]`);
        if (!widget) return;
        
        // Remove verifying state
        widget.classList.remove('app-verifying');
        
        // Remove verification badge
        const badge = widget.querySelector('.verification-badge');
        if (badge) {
            badge.remove();
        }
        
        if (isInstalled) {
            // Update to installed state
            widget.classList.add('app-verified-installed', 'app-installed');
            widget.dataset.installed = 'true';
            
            // Add special styling for base-system
            if (appId === 'base-system') {
                widget.classList.add('base-system-installed');
            }
            
            // Add installed badge permanently (or restore its visibility)
            let installedBadge = widget.querySelector('.installed-badge');
            if (!installedBadge) {
                installedBadge = document.createElement('div');
                installedBadge.className = 'installed-badge';
                installedBadge.textContent = 'Installed';
                widget.appendChild(installedBadge);
            } else {
                // Restore visibility if it was hidden
                installedBadge.style.display = '';
            }
            
            // Update installedApps array if not already there
            if (!installedApps.includes(appId)) {
                installedApps.push(appId);
            }
            
            // Remove from selected apps if it was selected for installation
            const index = selectedAppsToInstall.indexOf(appId);
            if (index > -1) {
                selectedAppsToInstall.splice(index, 1);
                autoDependencies.delete(appId);
                updateAppVisual(appId);
            }
            
            // Remove fade effect after animation
            setTimeout(() => {
                widget.classList.remove('app-verified-installed');
            }, 500);
        } else {
            // Return to default state (remove any special styling)
            widget.classList.remove('app-installed', 'app-verified-installed', 'base-system-installed');
            delete widget.dataset.installed;
            
            // Remove installed badge if present
            const installedBadge = widget.querySelector('.installed-badge');
            if (installedBadge) {
                installedBadge.remove();
            }
            
            // Update installedApps array
            const index = installedApps.indexOf(appId);
            if (index > -1) {
                installedApps.splice(index, 1);
            }
        }
    }
    
    /**
     * Handle verification complete message
     */
    function handleVerificationComplete() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (!refreshBtn) return;
        
        // Re-enable button and restore text
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('refreshing');
        const refreshText = refreshBtn.querySelector('.refresh-text');
        if (refreshText) {
            refreshText.textContent = 'Refresh';
        }
        
        // Update UI based on current state
        updateButtonStates();
    }
    
    /**
     * Handle verification cancelled message
     */
    function handleVerificationCancelled() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (!refreshBtn) return;
        
        // Re-enable button and restore text
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('refreshing');
        const refreshText = refreshBtn.querySelector('.refresh-text');
        if (refreshText) {
            refreshText.textContent = 'Refresh';
        }
        
        // Update UI based on current state
        updateButtonStates();
    }
    
    // Listen for messages from the extension
    window.addEventListener('message', function(event) {
        const message = event.data;
        
        switch (message.type) {
            case 'verification-result':
                handleVerificationResult(message.appId, message.isInstalled);
                break;
            case 'verification-complete':
                handleVerificationComplete();
                break;
            case 'verification-cancelled':
                handleVerificationCancelled();
                break;
            case 'ollama-status':
                handleOllamaStatus(message.isInstalled);
                break;
        }
    });
    
    /**
     * Handle ollama status message from backend
     */
    function handleOllamaStatus(isInstalled) {
        const continueInferenceBtn = document.getElementById('continue-inference-btn');
        if (continueInferenceBtn) {
            // Remove loading spinner
            continueInferenceBtn.classList.remove('loading');
            
            if (isInstalled) {
                // Enable the button
                continueInferenceBtn.disabled = false;
                continueInferenceBtn.title = 'Continue to Inference Instructions';
            } else {
                // Keep button disabled with tooltip
                continueInferenceBtn.disabled = true;
                continueInferenceBtn.title = 'Inference requires Ollama to be installed';
            }
        }
    }
})();
