/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { DiscoverDevicesMessage, Message } from '../../../types/messages';
import { Device, getDeviceTypeOptions, getDeviceTypeLabel, DeviceType, DeviceConfig } from '../../../types/devices';
import { ConnectXGroup } from '../../../types/connectxGroup';
import { SetupOptionsViewController } from '../../setup/options/setupOptionsViewController';
import { AppSelectionViewController } from '../../apps/selection/appSelectionViewController';
import { DeviceDiscoveryService, DeviceService, ConnectXGroupService, DeviceFingerprintService, extensionStateService } from '../../../services';
import { PairDetailsViewController } from '../../groups/pairDetails/pairDetailsViewController';
import { getDiscoveryErrorPresentation, NO_DEVICES_DISCOVERY_PRESENTATION } from './discoveryErrorPresentation';
import { URLS } from '../../../constants/config';

/**
 * device Manager View - Full editor view for managing devices.
 * Shows device list with add/edit forms and discovery functionality.
 * Subscribes to device store updates to automatically refresh when devices change.
 */
export class DeviceManagerViewController extends BaseViewController {
    private readonly deviceUnsubscribe?: () => void;
    private readonly groupUnsubscribe?: () => void;
    private editingDeviceId?: string;
    private showForm = false;
    private lastRenderParams?: { showAddForm?: boolean; editDeviceId?: string };

    public static viewId(): string {
        return 'devices/manager';
    }

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        deviceService: DeviceService;
        deviceDiscoveryService: DeviceDiscoveryService;
        connectxGroupService: ConnectXGroupService;
        deviceFingerprintService: DeviceFingerprintService;
    }) {
        super(deps.logger, deps.telemetry);

        this.deviceService = deps.deviceService;
        this.deviceDiscoveryService = deps.deviceDiscoveryService;
        this.connectxGroupService = deps.connectxGroupService;
        this.deviceFingerprintService = deps.deviceFingerprintService;

        this.template = this.loadTemplate('devices/manager/deviceManager.html');
        this.styles = this.loadTemplate('devices/manager/deviceManager.css');
        this.clientScript = this.loadTemplate('devices/manager/deviceManager.js');

        // Enable warning overlay support for paired device deletion warnings
        this.enableWarningOverlay();

        // Enable password input overlay for sudo password prompt during paired device deletion
        this.enablePasswordInputOverlay();

        // Enable announcement overlay support for one-time product announcements (e.g. ZRT)
        this.enableAnnouncementOverlay();

        // Subscribe to device updates
        this.deviceUnsubscribe = this.deviceService.subscribe(() => {
            this.logger.trace('Device store updated, refreshing device manager view');
            // Call refresh with last render params to update the webview
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device manager view after store update', { error });
            });
        });

        // Subscribe to group updates
        this.groupUnsubscribe = this.connectxGroupService.subscribe(() => {
            this.logger.trace('Group store updated, refreshing device manager view');
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device manager view after group store update', { error });
            });
        });
    }

    private readonly deviceService: DeviceService;
    private readonly deviceDiscoveryService: DeviceDiscoveryService;
    private readonly connectxGroupService: ConnectXGroupService;
    private readonly deviceFingerprintService: DeviceFingerprintService;

    async render(params?: { showAddForm?: boolean; editDeviceId?: string; showDeleteWarningForDeviceId?: string; deleteWarningDeviceName?: string; deleteWarningGroupId?: string; showZrtInfoModal?: boolean; zrtLogoUri?: string }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering device manager view', params);

        const { showDeleteWarningForDeviceId, deleteWarningDeviceName, deleteWarningGroupId, showZrtInfoModal, ...persistParams } = params || {};
        this.lastRenderParams = persistParams;

        const devices = await this.deviceService.getAllDevices();
        const groups = await this.connectxGroupService.getAllGroups();

        const devicesWithStatus = this.buildDevicesWithStatus(devices, groups);
        const { pairedGroups, unpairedDevices } = this.groupDevicesByPairing(devicesWithStatus);

        this.showForm = params?.showAddForm || devices.length === 0 || !!params?.editDeviceId;
        this.editingDeviceId = params?.editDeviceId;

        const editingDevice = this.editingDeviceId
            ? await this.deviceService.getDevice(this.editingDeviceId)
            : undefined;

        const data = this.buildRenderData(devices, devicesWithStatus, pairedGroups, unpairedDevices, editingDevice);

        const html = this.renderTemplate(this.template, data);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'devices.manager'
            },
            measurements: {
                deviceCount: devices.length
            }
        });

        const result = this.wrapHtml(html + this.getWarningOverlayHtml() + this.getPasswordInputOverlayHtml() + this.getAnnouncementOverlayHtml(), nonce);

        this.scheduleOverlays(params, showDeleteWarningForDeviceId, deleteWarningDeviceName, deleteWarningGroupId, showZrtInfoModal);

        return result;
    }

    /**
     * Merge device records with derived DNS-registration-needed and pairing status flags,
     * ready for template rendering.
     */
    private buildDevicesWithStatus(devices: Device[], groups: ConnectXGroup[]) {
        const deviceToGroupMap = new Map<string, ConnectXGroup>();
        for (const group of groups) {
            for (const deviceId of group.deviceIds) {
                deviceToGroupMap.set(deviceId, group);
            }
        }

        return devices.map((device) => {
            const needsDnsRegistration = this.needsDnsRegistration(device);
            const group = deviceToGroupMap.get(device.id);

            return {
                ...device,
                needsDnsRegistration,
                isPaired: !!group,
                groupId: group?.id,
                deviceType: device.fingerprint?.deviceType || DeviceType.Unknown,
                deviceTypeLabel: getDeviceTypeLabel(device.fingerprint?.deviceType) || '—'
            };
        });
    }

    /**
     * Determine whether a device is missing DNS registration (setup, key-auth verified, but
     * no DNS instance name assigned yet).
     */
    private needsDnsRegistration(device: Device): boolean {
        return !!(device.isSetup &&
            device.useKeyAuth &&
            device.keySetup?.connectionTested &&
            (device.dnsInstanceName === undefined ||
             device.dnsInstanceName === null ||
             device.dnsInstanceName.trim().length === 0));
    }

    /**
     * Split devices with status into paired groups and unpaired devices for template display.
     */
    private groupDevicesByPairing(devicesWithStatus: ReturnType<DeviceManagerViewController['buildDevicesWithStatus']>) {
        const groupMap = new Map<string, typeof devicesWithStatus>();
        const unpairedDevices: typeof devicesWithStatus = [];

        for (const device of devicesWithStatus) {
            if (device.isPaired && device.groupId) {
                if (!groupMap.has(device.groupId)) {
                    groupMap.set(device.groupId, []);
                }
                groupMap.get(device.groupId)!.push(device);
            } else {
                unpairedDevices.push(device);
            }
        }

        const pairedGroups = Array.from(groupMap.entries()).map(([groupId, groupDevices]) => ({
            groupId,
            devices: groupDevices
        }));

        return { pairedGroups, unpairedDevices };
    }

    /**
     * Build the data object passed to the device manager template.
     */
    private buildRenderData(
        devices: Device[],
        devicesWithStatus: ReturnType<DeviceManagerViewController['buildDevicesWithStatus']>,
        pairedGroups: ReturnType<DeviceManagerViewController['groupDevicesByPairing']>['pairedGroups'],
        unpairedDevices: ReturnType<DeviceManagerViewController['groupDevicesByPairing']>['unpairedDevices'],
        editingDevice?: Device
    ) {
        return {
            devices: devicesWithStatus.length > 0 ? devicesWithStatus : null,
            pairedGroups: pairedGroups.length > 0 ? pairedGroups : null,
            unpairedDevices: unpairedDevices.length > 0 ? unpairedDevices : null,
            pairedDeviceCount: pairedGroups.reduce((count, group) => count + group.devices.length, 0),
            unpairedDeviceCount: unpairedDevices.length,
            hasPairedGroups: pairedGroups.length > 0,
            noDevices: devices.length === 0,
            hiddenFormButton: this.showForm,
            hiddenForm: !this.showForm,
            formTitle: editingDevice ? 'Edit Device' : 'Add New Device',
            submitButtonText: editingDevice ? 'Update Device' : 'Add Device',
            deviceName: editingDevice?.name || '',
            deviceHost: editingDevice?.host || '',
            deviceUsername: editingDevice?.username || '',
            devicePort: editingDevice?.port || 22,
            editingDeviceId: this.editingDeviceId || '',
            editingDevice: !!editingDevice,
            editingDeviceDnsInstanceName: editingDevice?.dnsInstanceName || '',
            deviceTypeOptions: getDeviceTypeOptions(),
            selectedDeviceType: editingDevice?.fingerprint?.deviceType || ''
        };
    }

    /**
     * Schedule the paired-delete-warning overlay (delegated from the sidebar) or, failing
     * that, the one-time ZRT announcement overlay - whichever is applicable after the webview
     * HTML has been set.
     */
    private scheduleOverlays(
        params: { zrtLogoUri?: string } | undefined,
        showDeleteWarningForDeviceId?: string,
        deleteWarningDeviceName?: string,
        deleteWarningGroupId?: string,
        showZrtInfoModal?: boolean
    ): void {
        if (showDeleteWarningForDeviceId && deleteWarningDeviceName && deleteWarningGroupId) {
            this.logger.info('Scheduling paired delete warning overlay from sidebar delegation', {
                deviceId: showDeleteWarningForDeviceId,
                deviceName: deleteWarningDeviceName,
                groupId: deleteWarningGroupId
            });
            setTimeout(() => {
                this.sendMessageToWebview({
                    type: 'show-paired-delete-warning',
                    deviceId: showDeleteWarningForDeviceId,
                    deviceName: deleteWarningDeviceName,
                    groupId: deleteWarningGroupId
                });
            }, 100);
        } else if (showZrtInfoModal) {
            // ZRT info modal requested via navigation from the sidebar's corresponding Quick Links entry
            this.logger.info('Scheduling ZRT info modal overlay from Quick Links navigation');
            setTimeout(() => {
                this.sendMessageToWebview({
                    type: 'show-zrt-info',
                    zrtLogoUri: params?.zrtLogoUri
                });
            }, 100);
        } else if (!extensionStateService.hasSeenZrtAnnouncement()) {
            // One-time ZRT product announcement. Only shown once (persisted
            // in globalState), and only when there isn't a more urgent overlay (delete warning)
            // already scheduled to show. The announcement's own instructions guide the user to
            // pick a device manually via Device Manager.
            this.logger.info('Scheduling one-time ZRT announcement overlay');
            setTimeout(() => {
                this.sendMessageToWebview({
                    type: 'show-zrt-announcement',
                    zrtLogoUri: params?.zrtLogoUri
                });
            }, 100);
        }
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        switch (message.type) {
            case 'create-device':
                await this.createDevice(message.data);
                break;
            case 'update-device':
                await this.updateDevice(message.id, message.updates);
                break;
            case 'delete-device':
                await this.deleteDevice(message.id);
                break;
            case 'connect-device':
                await this.connectDevice(message.id, message.newWindow);
                break;
            case 'setup-device':
                await this.setupDevice(message.id);
                break;
            case 'manage-apps':
                await this.manageApps(message.id);
                break;
            case 'register-dns':
                await this.registerDns(message.id);
                break;
            case 'discover-devices':
                await this.discoverDevices(message.options);
                break;
            case 'rediscover-device':
                await this.rediscoverDevice(message.deviceId, message.dnsInstanceName, message.timeoutMs);
                break;
            case 'confirm-delete-paired-device':
                await this.handleDeletePairedDevice(message.id, message.groupId);
                break;
            case 'password-submitted-for-delete':
                await this.handlePasswordSubmittedForDelete(message.password, message.deviceId, message.groupId);
                break;
            case 'password-input-cancelled-for-delete':
                this.logger.debug('Paired device deletion cancelled - password input dismissed', { id: message.deviceId });
                break;
            case 'pairing-details':
                await this.viewPairingDetails(message.groupId);
                break;
            case 'unpair-devices':
                await this.navigateToUnpairDevices(message.groupId);
                break;
            case 'refresh':
                this.refresh(this.lastRenderParams).catch(error => {
                    this.logger.error('Failed to refresh device manager view', { error });
                });
                break;
            case 'zrt-announcement-dismiss':
                await this.handleZrtAnnouncementDismiss();
                break;
            case 'zrt-announcement-learn-more':
                await this.handleZrtAnnouncementLearnMore();
                break;
            case 'zrt-info-learn-more':
                await this.handleZrtInfoLearnMore();
                break;
            case 'zrt-info-close':
                this.handleZrtInfoClose();
                break;
        }
    }

    private async viewPairingDetails(groupId: string): Promise<void> {
        this.logger.debug('Navigating to pair details view', { groupId });
        await this.navigateTo(PairDetailsViewController.viewId(), { groupId });
    }

    private async navigateToUnpairDevices(groupId: string): Promise<void> {
        this.logger.debug('Navigating to unpair devices view', { groupId });
        const { UnpairDevicesViewController } = await import('../../groups/unpairDevices/unpairDevicesViewController.js');
        await this.navigateTo(UnpairDevicesViewController.viewId(), { groupId });
    }

    /**
     * Mark the one-time ZRT announcement as seen so it is not shown again.
     */
    private async handleZrtAnnouncementDismiss(): Promise<void> {
        this.logger.info('ZRT announcement dismissed');
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.Announcement,
            action: 'dismiss',
            properties: {
                announcementId: 'zrt-intro'
            }
        });
        await extensionStateService.setZrtAnnouncementSeen();
    }

    /**
     * Open the ZRT documentation and mark the announcement as seen.
     */
    private async handleZrtAnnouncementLearnMore(): Promise<void> {
        this.logger.info('ZRT announcement "Learn More" clicked');
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.Announcement,
            action: 'learn-more',
            properties: {
                announcementId: 'zrt-intro'
            }
        });
        await extensionStateService.setZrtAnnouncementSeen();
        await vscode.env.openExternal(vscode.Uri.parse(URLS.ZRT_LEARN_MORE));
    }

    /**
     * Open the ZRT documentation from the quick links ZRT info modal's "Learn More" action
     */
    private async handleZrtInfoLearnMore(): Promise<void> {
        this.logger.info('ZRT info modal "Learn More" clicked', { url: URLS.ZRT_LEARN_MORE });
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.QuickLink,
            action: 'learn-more',
            properties: {
                linkId: 'zrt-info'
            }
        });
        await vscode.env.openExternal(vscode.Uri.parse(URLS.ZRT_LEARN_MORE));
    }

    /**
     * Handle the quick links ZRT info modal being closed.
     */
    private handleZrtInfoClose(): void {
        this.logger.info('ZRT info modal closed');
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.QuickLink,
            action: 'close',
            properties: {
                linkId: 'zrt-info'
            }
        });
    }

    private async createDevice(data: DeviceConfig): Promise<void> {
        this.logger.info('Creating device', { name: data.name });

        // Clear the persisted "show add form" state before calling the service. 
        // This ensures the form is closed immediately, without requiring a second click.
        this.lastRenderParams = {};

        try {
            await this.deviceService.createDevice(data);
            this.logger.debug('device created successfully');

            // Send success message to webview
            this.sendMessageToWebview({
                type: 'deviceCreated',
                success: true
            });
        } catch (error) {
            this.logger.error('Failed to create device', { error });
            
            // Send error message to webview
            this.sendMessageToWebview({
                type: 'deviceCreateError',
                error: error instanceof Error ? error.message : 'Failed to create device'
            });
        }
    }

    private async updateDevice(id: string, updates: Partial<Device>): Promise<void> {
        this.logger.info('Updating device', { id });

        // Clear the persisted "editing device" state before calling the service. 
        // This ensures the form is closed immediately, without requiring a second click.
        this.lastRenderParams = {};

        try {
            // Any fingerprint update (e.g. manual device type selection from the Edit Device
            // form) must be validated and merged into the device's existing fingerprint rather
            // than blindly overwritten. DeviceStore.update performs a shallow merge, so passing
            // through a bare `fingerprint: {}` (or one without a selectable deviceType) would
            // otherwise replace the existing fingerprint object wholesale and silently wipe it.
            if (updates.fingerprint) {
                const requestedDeviceType = updates.fingerprint.deviceType;
                const isSelectableType = !!requestedDeviceType &&
                    getDeviceTypeOptions().some(option => option.value === requestedDeviceType);

                if (!isSelectableType) {
                    throw new Error(`Invalid device type: ${requestedDeviceType}`);
                }

                const existingDevice = await this.deviceService.getDevice(id);
                updates = {
                    ...updates,
                    fingerprint: this.deviceFingerprintService.updateDeviceFingerprint(
                        existingDevice?.fingerprint,
                        { deviceType: requestedDeviceType }
                    )
                };
            }

            await this.deviceService.updateDevice(id, updates);
            this.logger.debug('device updated successfully', { id });

            // Send success message to webview
            this.sendMessageToWebview({
                type: 'deviceUpdated',
                success: true
            });
        } catch (error) {
            this.logger.error('Failed to update device', { error, id });
            
            // Send error message to webview
            this.sendMessageToWebview({
                type: 'deviceUpdateError',
                error: error instanceof Error ? error.message : 'Failed to update device'
            });
        }
    }

    /**
     * Delete a device. If the device is part of a paired group, shows a warning overlay
     * before proceeding. Otherwise, shows a standard confirmation dialog.
     */
    private async deleteDevice(id: string): Promise<void> {
        this.logger.info('Deleting device', { id });

        try {
            const device = await this.deviceService.getDevice(id);
            
            if (!device) {
                this.logger.error('device not found for deletion', { id });
                throw new Error(`device not found: ${id}`);
            }

            // Check if device is part of a paired group
            const group = await this.connectxGroupService.getGroupForDevice(id);
            if (group) {
                this.logger.info('Device is part of a paired group, showing warning overlay', { id, groupId: group.id });
                this.sendMessageToWebview({
                    type: 'show-paired-delete-warning',
                    deviceId: id,
                    deviceName: device.name,
                    groupId: group.id
                });
                return;
            }

            // Standard deletion: Show VS Code confirmation dialog
            const deviceName = device.name;
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${deviceName}?`,
                { modal: true },
                'Delete'
            );

            if (confirmation !== 'Delete') {
                this.logger.debug('device deletion cancelled by user', { id, deviceName });
                return;
            }

            // User confirmed, proceed with deletion
            await this.deviceService.deleteDevice(id);
            this.logger.debug('device deleted successfully', { id, deviceName });
        } catch (error) {
            this.logger.error('Failed to delete device', { error, id });
            throw error;
        }
    }

    /**
     * Handle confirmed deletion of a paired device.
     * Shows the password input overlay to prompt for sudo password before proceeding.
     */
    private async handleDeletePairedDevice(id: string, groupId: string): Promise<void> {
        this.logger.info('User confirmed paired device deletion, prompting for password', { id, groupId });

        // Send message to webview to show password input overlay
        this.sendMessageToWebview({
            type: 'show-password-input-for-delete',
            deviceId: id,
            groupId: groupId
        });
    }

    /**
     * Handle password submission for paired device deletion.
     * Unconfigures ConnectX NICs for all devices in the group, removes the group,
     * then deletes the device.
     */
    private async handlePasswordSubmittedForDelete(password: string, deviceId: string, groupId: string): Promise<void> {
        this.logger.info('Password submitted for paired device deletion', { deviceId, groupId });

        try {
            const device = await this.deviceService.getDevice(deviceId);
            if (!device) {
                this.logger.error('device not found for paired deletion', { id: deviceId });
                throw new Error(`device not found: ${deviceId}`);
            }

            // Unconfigure ConnectX NICs and remove the group
            const unconfigureResult = await this.connectxGroupService.removeGroupAndUnconfigureNICs(groupId, password);
            if (!unconfigureResult.success) {
                // Abort device deletion — the group still exists in the store.
                // Proceeding would leave an orphaned group referencing a deleted device.
                this.logger.error('Failed to remove group during paired device deletion; aborting device delete to prevent orphaned group', { 
                    id: deviceId, groupId, error: unconfigureResult.error 
                });
                throw new Error(unconfigureResult.error ?? 'Failed to remove pairing group');
            }

            this.logger.debug('Group unconfigured and removed', { id: deviceId, groupId });

            // Notify the user if NIC unconfiguration had issues (e.g. wrong sudo password)
            if (unconfigureResult.nonFatalError) {
                this.logger.warn('NIC unconfiguration had issues during paired device deletion', {
                    id: deviceId, groupId, error: unconfigureResult.nonFatalError
                });
                vscode.window.showWarningMessage(
                    `Device "${device.name}" was deleted and the pairing was removed, but the ConnectX network configuration could not be removed from one or more devices due to an unexpected error.`
                );
            }

            // Delete the device
            await this.deviceService.deleteDevice(deviceId);
            this.logger.debug('Paired device deleted', { id: deviceId, deviceName: device.name, groupId });
        } catch (error) {
            this.logger.error('Failed to delete paired device', { error, id: deviceId, groupId });
            throw error;
        }
    }

    private async connectDevice(id: string, newWindow?: boolean): Promise<void> {
        this.logger.info('Connecting to device', { id, newWindow });

        try {
            await this.deviceService.connectToDevice(id, newWindow);
            this.logger.debug('Connection initiated', { id });
        } catch (error) {
            const { DeviceNeedsSetupError } = await import('../../../services/deviceService.js');
            
            // If device needs setup, navigate to setup flow
            if (error instanceof DeviceNeedsSetupError) {
                this.logger.info('device needs setup, navigating to setup flow', { 
                    id, 
                    deviceName: error.device.name 
                });
                
                // Navigate to setup options view in current (editor) panel
                await this.navigateTo(SetupOptionsViewController.viewId(), { device: error.device }, 'editor');
                return;
            }
            
            this.logger.error('Failed to connect to device', { error, id });
            throw error;
        }
    }

    private async setupDevice(id: string): Promise<void> {
        this.logger.info('Setting up device', { id });

        try {
            const device = await this.deviceService.getDevice(id);
            
            if (!device) {
                this.logger.error('device not found for setup', { id });
                throw new Error(`device not found: ${id}`);
            }

            // Always navigate to setup options view
            this.logger.debug('Navigating to setup options', { id, deviceName: device.name });
            
            // Navigate to setup options view in current (editor) panel
            await this.navigateTo(SetupOptionsViewController.viewId(), { device }, 'editor');
        } catch (error) {
            this.logger.error('Failed to start device setup', { error, id });
            throw error;
        }
    }

    private async manageApps(id: string): Promise<void> {
        this.logger.info('Navigating to app management', { id });

        const device = await this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for app management', { id });
            throw new Error(`device not found: ${id}`);
        }

        await this.navigateTo(AppSelectionViewController.viewId(), { device });
    }

    private async registerDns(id: string): Promise<void> {
        this.logger.info('Navigating to mDNS registration', { id });
        const device = await this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for mDNS registration', { id });
            throw new Error(`device not found: ${id}`);
        }
        const { DnsRegistrationViewController } = await import('../../setup/dnsRegistration/dnsRegistrationViewController.js');
        await this.navigateTo(DnsRegistrationViewController.viewId(), { device, setupType: 'migration' }, 'editor');
    }

    private async discoverDevices(options?: DiscoverDevicesMessage['options']): Promise<void> {
        this.logger.info('Starting device discovery', options);

        try {
            // Notify webview that discovery has started
            this.sendMessageToWebview({
                type: 'discoveryStarted'
            });

            // Perform discovery
            const devices = await this.deviceDiscoveryService.discoverDevices(options?.timeout);
            this.logger.info('Discovery completed', { count: devices.length });

            // Send results back to webview
            const discoveryCompletedMessage: Record<string, unknown> = {
                type: 'discoveryCompleted',
                devices: devices
            };

            if (devices.length === 0) {
                discoveryCompletedMessage.emptyStateTitle = NO_DEVICES_DISCOVERY_PRESENTATION.title;
                discoveryCompletedMessage.emptyStateCode = NO_DEVICES_DISCOVERY_PRESENTATION.code;
            }

            this.sendMessageToWebview(discoveryCompletedMessage);
        } catch (error) {
            this.logger.error('Discovery failed', { error });

            const discoveryError = getDiscoveryErrorPresentation(error);

            // Send error to webview
            this.sendMessageToWebview({
                type: 'discoveryError',
                error: error instanceof Error ? error.message : 'Discovery failed',
                errorTitle: discoveryError.title,
                errorCode: discoveryError.code
            });
        }
    }

    /**
     * Rediscover a specific device by its DNS instance name.
     */
    private async rediscoverDevice(deviceId: string, dnsInstanceName: string, timeoutMs?: number): Promise<void> {
        const normalizedDnsInstanceName = typeof dnsInstanceName === 'string' ? dnsInstanceName.trim() : '';

        this.logger.info('Starting device rediscovery', {
            deviceId,
            dnsInstanceName: normalizedDnsInstanceName,
            timeoutMs
        });

        try {
            if (!normalizedDnsInstanceName) {
                throw new Error('Missing DNS instance name for device rediscovery');
            }

            // Notify webview that discovery has started
            this.sendMessageToWebview({
                type: 'discoveryStarted'
            });

            // Perform rediscovery for this specific device
            const devices = await this.deviceDiscoveryService.rediscoverDevices([normalizedDnsInstanceName], timeoutMs);
            this.logger.info('Device rediscovery completed', { deviceId, count: devices.length });

            // Send results back to webview
            const discoveryCompletedMessage: Record<string, unknown> = {
                type: 'discoveryCompleted',
                devices: devices
            };

            if (devices.length === 0) {
                discoveryCompletedMessage.emptyStateTitle = NO_DEVICES_DISCOVERY_PRESENTATION.title;
                discoveryCompletedMessage.emptyStateCode = NO_DEVICES_DISCOVERY_PRESENTATION.code;
            }

            this.sendMessageToWebview(discoveryCompletedMessage);
        } catch (error) {
            this.logger.error('Device rediscovery failed', { deviceId, error });

            const discoveryError = getDiscoveryErrorPresentation(error);

            // Send error to webview
            this.sendMessageToWebview({
                type: 'discoveryError',
                error: error instanceof Error ? error.message : 'Device rediscovery failed',
                errorTitle: discoveryError.title,
                errorCode: discoveryError.code
            });
        }
    }

    dispose(): void {
        if (this.deviceUnsubscribe) {
            this.deviceUnsubscribe();
        }
        if (this.groupUnsubscribe) {
            this.groupUnsubscribe();
        }
        super.dispose();
    }
}
