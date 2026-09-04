/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

(function() {
    const vscode = acquireVsCodeApi();

    let currentDetectedType = null;

    document.addEventListener('DOMContentLoaded', function() {
        const cancelBtnLoading = document.getElementById('cancelBtnLoading');
        const cancelBtnResult = document.getElementById('cancelBtnResult');
        const modifyBtn = document.getElementById('modifyBtn');
        const confirmBtn = document.getElementById('confirmBtn');
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');

        if (cancelBtnLoading) {
            cancelBtnLoading.addEventListener('click', handleCancel);
        }

        if (cancelBtnResult) {
            cancelBtnResult.addEventListener('click', handleCancel);
        }

        if (modifyBtn) {
            modifyBtn.addEventListener('click', handleModify);
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', handleConfirm);
        }

        if (deviceTypeSelect) {
            deviceTypeSelect.addEventListener('change', handleSelectChange);
        }

        // Auto-start detection as soon as the view loads
        vscode.postMessage({ type: 'startFingerprintDetection' });
    });

    function handleCancel() {
        vscode.postMessage({ type: 'cancelFingerprintDetection' });
    }

    function handleModify() {
        const viewMode = document.getElementById('viewMode');
        const editMode = document.getElementById('editMode');
        const hintKnown = document.getElementById('hintKnown');
        const hintUnknown = document.getElementById('hintUnknown');
        const confirmBtn = document.getElementById('confirmBtn');
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');

        if (viewMode) {
            viewMode.classList.add('hidden');
        }
        if (editMode) {
            editMode.classList.remove('hidden');
        }
        if (hintKnown) {
            hintKnown.classList.add('hidden');
        }
        if (hintUnknown) {
            hintUnknown.classList.remove('hidden');
        }

        // Pre-select the previously detected type in the dropdown if available
        if (currentDetectedType && deviceTypeSelect) {
            deviceTypeSelect.value = currentDetectedType;
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
        } else {
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
        }
    }

    function handleConfirm() {
        const editMode = document.getElementById('editMode');
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');
        const confirmBtn = document.getElementById('confirmBtn');

        const isEditMode = editMode && !editMode.classList.contains('hidden');

        if (isEditMode) {
            const selectedType = deviceTypeSelect ? deviceTypeSelect.value : '';
            if (!selectedType) {
                return;
            }
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            vscode.postMessage({ type: 'confirmDeviceType', deviceType: selectedType });
        } else {
            if (!currentDetectedType) {
                return;
            }
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            vscode.postMessage({ type: 'confirmDeviceType', deviceType: currentDetectedType });
        }
    }

    function handleSelectChange() {
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = !deviceTypeSelect || !deviceTypeSelect.value;
        }
    }

    window.addEventListener('message', function(event) {
        const msg = event.data;
        if (!msg || !msg.type) {
            return;
        }

        switch (msg.type) {
            case 'fingerprintResult':
                handleDetectionResult(msg);
                break;
        }
    });

    function handleDetectionResult(msg) {
        const loadingState = document.getElementById('loadingState');
        const resultState = document.getElementById('resultState');

        if (loadingState) {
            loadingState.classList.add('hidden');
        }
        if (resultState) {
            resultState.classList.remove('hidden');
        }

        if (msg.requiresSelection) {
            showAmbiguousState(msg.detectedLabel);
        } else {
            showKnownTypeState(msg.deviceType, msg.displayName);
        }
    }

    function showKnownTypeState(deviceType, displayName) {
        currentDetectedType = deviceType;

        const deviceTypeDisplay = document.getElementById('deviceTypeDisplay');
        const viewMode = document.getElementById('viewMode');
        const editMode = document.getElementById('editMode');
        const subtitleKnown = document.getElementById('subtitleKnown');
        const subtitleUnknown = document.getElementById('subtitleUnknown');
        const detectedLine = document.getElementById('detectedLine');
        const hintKnown = document.getElementById('hintKnown');
        const hintUnknown = document.getElementById('hintUnknown');
        const modifyBtn = document.getElementById('modifyBtn');
        const confirmBtn = document.getElementById('confirmBtn');

        if (deviceTypeDisplay) { deviceTypeDisplay.textContent = displayName; }
        if (viewMode) { viewMode.classList.remove('hidden'); }
        if (editMode) { editMode.classList.add('hidden'); }
        if (subtitleKnown) { subtitleKnown.classList.remove('hidden'); }
        if (subtitleUnknown) { subtitleUnknown.classList.add('hidden'); }
        if (detectedLine) { detectedLine.classList.add('hidden'); }
        if (hintKnown) { hintKnown.classList.remove('hidden'); }
        if (hintUnknown) { hintUnknown.classList.add('hidden'); }
        if (modifyBtn) { modifyBtn.classList.remove('hidden'); }
        if (confirmBtn) { confirmBtn.disabled = false; }
    }

    function showAmbiguousState(detectedLabel) {
        currentDetectedType = null;

        const viewMode = document.getElementById('viewMode');
        const editMode = document.getElementById('editMode');
        const subtitleKnown = document.getElementById('subtitleKnown');
        const subtitleUnknown = document.getElementById('subtitleUnknown');
        const detectedLine = document.getElementById('detectedLine');
        const detectedLabelEl = document.getElementById('detectedLabel');
        const hintKnown = document.getElementById('hintKnown');
        const hintUnknown = document.getElementById('hintUnknown');
        const modifyBtn = document.getElementById('modifyBtn');
        const confirmBtn = document.getElementById('confirmBtn');
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');

        if (subtitleKnown) { subtitleKnown.classList.add('hidden'); }
        if (subtitleUnknown) { subtitleUnknown.classList.remove('hidden'); }
        if (detectedLabelEl) { detectedLabelEl.textContent = detectedLabel || 'Device unknown'; }
        if (detectedLine) { detectedLine.classList.remove('hidden'); }
        if (viewMode) { viewMode.classList.add('hidden'); }
        if (editMode) { editMode.classList.remove('hidden'); }
        if (deviceTypeSelect) { deviceTypeSelect.value = ''; }
        if (hintKnown) { hintKnown.classList.add('hidden'); }
        if (hintUnknown) { hintUnknown.classList.remove('hidden'); }
        if (modifyBtn) { modifyBtn.classList.add('hidden'); }
        if (confirmBtn) { confirmBtn.disabled = true; }
    }
})();
