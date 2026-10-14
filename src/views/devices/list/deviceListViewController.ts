/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import Handlebars from 'handlebars';
import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Message } from '../../../types/messages';
import { ConnectXGroup } from '../../../types/connectxGroup';
import { URLS } from '../../../constants/config';
import * as vscode from 'vscode';
import { SetupOptionsViewController } from '../../setup/options/setupOptionsViewController';
import { AppSelectionViewController } from '../../apps/selection/appSelectionViewController';
import { DeviceService, ConnectXGroupService, extensionStateService, remoteSessionRegistryService } from '../../../services';
import { TemplateListViewController } from '../../templates/templateListViewController';
import { DnsRegistrationViewController } from '../../setup/dnsRegistration/dnsRegistrationViewController';
import { DeviceManagerViewController } from '../manager/deviceManagerViewController';
import { PairDetailsViewController } from '../../groups/pairDetails/pairDetailsViewController';
import { connectionStateStore, deviceReachabilityStore } from '../../../store';
import { DEVICE_STATUS_LABELS, DeviceStatus } from '../../../types/devicestatus';
import { getDeviceStatus } from '../../../utils/deviceStatus';
import { deviceReachabilityCheckService } from '../../../services/deviceReachabilityCheckService';

/**
 * Device list view for the sidebar.
 * Displays a compact list of devices with quick actions.
 * Subscribes to device store and group store updates to automatically refresh when devices or groups change.
 */
export class DeviceListViewController extends BaseViewController {
    private readonly unsubscribes: (() => void)[] = [];
    private readonly connectxGroupService: ConnectXGroupService;
    private readonly deviceService: DeviceService;
    private lastRenderParams?: Record<string, unknown>;

    public static viewId(): string {
        return 'devices/list';
    }

    constructor(deps: { 
        logger: Logger; 
        telemetry: ITelemetryService;
        deviceService: DeviceService;
        connectxGroupService: ConnectXGroupService;
    }) {
        super(deps.logger, deps.telemetry);
        this.deviceService = deps.deviceService;
        this.connectxGroupService = deps.connectxGroupService;
        
        // Load templates
        this.template = this.loadTemplate('devices/list/deviceList.html');
        this.styles = this.loadTemplate('devices/list/deviceList.css');
        this.clientScript = this.loadTemplate('devices/list/deviceList.js');

        // Register device list item partial for template reuse
        const deviceListItemPartial = this.loadTemplate('devices/list/deviceListItem.html');
        Handlebars.registerPartial('deviceListItem', deviceListItemPartial);

        this.unsubscribes.push(
            // Subscribe to device updates
            this.deviceService.subscribe(() => {
                this.logger.trace('Device store updated, refreshing device list view');
                this.refresh(this.lastRenderParams).catch(error => {
                    this.logger.error('Failed to refresh device list view after store update', { error });
                });
            }),
            // Subscribe to group store updates
            this.connectxGroupService.subscribe(() => {
                this.logger.trace('Group store updated, refreshing device list view');
                this.refresh(this.lastRenderParams).catch(error => {
                    this.logger.error('Failed to refresh device list view after group store update', { error });
                });
            }),
            // Subscribe to connection state updates (active Remote-SSH sessions across windows)
            connectionStateStore.subscribe(() => {
                this.logger.trace('Connection state store updated, refreshing device list view');
                this.refresh(this.lastRenderParams).catch(error => {
                    this.logger.error('Failed to refresh device list view after connection state update', { error });
                });
            }),
            // Subscribe to device reachability updates
            deviceReachabilityStore.subscribe(() => {
                this.logger.trace('Device reachability updated, updating device list status indicators');
                this.updateReachabilityIndicators().catch(error => {
                    this.logger.error('Failed to update device list reachability indicators', { error });
                });
            })
        );
    }

    async render(params?: Record<string, unknown>, nonce?: string): Promise<string> {
        this.logger.debug('Rendering device list view');

        // Store params for later use in refresh
        this.lastRenderParams = params;

        // Re-read the shared active session registry immediately rather than trusting the
        // last background reconcile, so a device connected in another window doesn't still
        // show "Connect" for several seconds after opening/refreshing this view.
        await this.reconcileConnectionState();

        const devices = await this.deviceService.getAllDevices();
        const groups = await this.connectxGroupService.getAllGroups();

        // Create a map of device IDs to their group for quick lookup
        const deviceToGroupMap = new Map<string, ConnectXGroup>();
        for (const group of groups) {
            for (const deviceId of group.deviceIds) {
                deviceToGroupMap.set(deviceId, group);
            }
        }
        
        // Add DNS registration status and pairing info to each device
        const devicesWithStatus = devices.map((device) => {
            const needsDnsRegistration = device.isSetup && 
                                        device.useKeyAuth && 
                                        device.keySetup?.connectionTested &&
                                        (device.dnsInstanceName === undefined ||
                                         device.dnsInstanceName === null ||
                                         device.dnsInstanceName.trim().length === 0);
            
            const group = deviceToGroupMap.get(device.id);

            const connectionState = connectionStateStore.get(device.id);
            const isConnected = !!connectionState;
            const isConnectedHere = connectionState?.windowId === vscode.env.sessionId;
            const isConnectedElsewhere = isConnected && !isConnectedHere;
            // Determine device reachability and status
            const reachabilityState = deviceReachabilityStore.get(device.id);
            const deviceStatus = getDeviceStatus(
                device,
                connectionState,
                reachabilityState,
                isConnectedHere,
                isConnectedElsewhere
            );
            const deviceStatusLabel = DEVICE_STATUS_LABELS[deviceStatus] || 'Unknown';
            const notReachable = deviceStatus === DeviceStatus.CheckStatus
                || deviceStatus === DeviceStatus.CompleteSetup;
            const unreachable = deviceStatus === DeviceStatus.Unreachable;

            return {
                ...device,
                needsDnsRegistration,
                isPaired: !!group,
                groupId: group?.id,
                isConnected,
                isConnectedHere,
                isConnectedElsewhere,
                notReachable,
                unreachable,
                deviceStatus,
                deviceStatusLabel,
                reachabilityChecking: reachabilityState?.checking ?? false,
                reachabilityCheckedAt: reachabilityState?.checkedAt ?? '',
                reachabilityExplicit: deviceReachabilityStore.isExplicitCheck(device.id)
            };
        });

        const connectedDevices = devicesWithStatus.filter(device => device.isConnectedHere);
        const visibleDevices = connectedDevices.length > 0 ? connectedDevices : devicesWithStatus;

        // Separate devices into paired groups and unpaired devices
        const groupMap = new Map<string, typeof visibleDevices>();
        const unpairedDevices: typeof visibleDevices = [];

        for (const device of visibleDevices) {
            if (device.isPaired && device.groupId) {
                if (!groupMap.has(device.groupId)) {
                    groupMap.set(device.groupId, []);
                }
                groupMap.get(device.groupId)!.push(device);
            } else {
                unpairedDevices.push(device);
            }
        }

        // Convert map to array
        const pairedGroups = Array.from(groupMap.entries()).map(([groupId, groupDevices]) => ({
            groupId,
            devices: groupDevices
        }));
        
        // Prepare data for template
        const templateData = {
            devices: visibleDevices,
            connectedDevices,
            connectedInThisWindow: connectedDevices.length > 0,
            pairedGroups: pairedGroups.length > 0 ? pairedGroups : null,
            unpairedDevices: unpairedDevices.length > 0 ? unpairedDevices : null,
            pairedDeviceCount: pairedGroups.reduce((sum, g) => sum + g.devices.length, 0),
            unpairedDeviceCount: unpairedDevices.length,
            noDevices: visibleDevices.length === 0,
            zrtQuickLinkSeen: extensionStateService.hasSeenQuickLinkBadge('zrt-info')
        };

        const html = this.renderTemplate(this.template, templateData);
        
        // Track navigation
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'devices.list'
            },
            measurements: {
                deviceCount: devices.length,
                pairedGroupCount: pairedGroups.length,
                unpairedDeviceCount: unpairedDevices.length
            }
        });
        
        return this.wrapHtml(html, nonce);
    }

    /**
     * Re-read the shared active session registry and reconcile the connection state store
     * against it, so button state reflects the true current state rather than only what the
     * last file-watcher event or periodic timer picked up.
     */
    private async reconcileConnectionState(): Promise<void> {
        try {
            const entries = await remoteSessionRegistryService.readAll();
            connectionStateStore.reconcile(entries);
        } catch (error) {
            this.logger.error('Failed to reconcile connection state before rendering device list', { error });
        }
    }

    private hasCurrentWindowConnection(): boolean {
        return Array.from(connectionStateStore.getAll().values()).some(connection =>
            connection.connected && connection.windowId === vscode.env.sessionId
        );
    }

    private async updateReachabilityIndicators(): Promise<void> {
        const devices = await this.deviceService.getAllDevices();
        this.sendMessageToWebview({
            type: 'reachability-status-updated',
            statuses: devices.map(device => {
                const connectionState = connectionStateStore.get(device.id);
                const reachabilityState = deviceReachabilityStore.get(device.id);
                const isConnectedHere = connectionState?.windowId === vscode.env.sessionId;
                const isConnectedElsewhere = !!connectionState && !isConnectedHere;
                const status = getDeviceStatus(
                    device,
                    connectionState,
                    reachabilityState,
                    isConnectedHere,
                    isConnectedElsewhere
                );

                return {
                    deviceId: device.id,
                    status,
                    notReachable: status === DeviceStatus.CheckStatus || status === DeviceStatus.CompleteSetup,
                    unreachable: status === DeviceStatus.Unreachable,
                    checking: reachabilityState?.checking ?? false,
                    checkedAt: reachabilityState?.checkedAt,
                    explicit: deviceReachabilityStore.isExplicitCheck(device.id)
                };
            })
        });
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        if (this.hasCurrentWindowConnection() && message.type !== 'disconnect-device' && message.type !== 'refresh') {
            this.logger.warn('Ignoring device list action while connected to a device', { type: message.type });
            return;
        }

        switch (message.type) {
            case 'refresh':
                await this.refresh();
                break;
            
            case 'select-device':
                await this.selectDevice(message.id);
                break;
            
            case 'quick-links':
                await this.handleLinkClick(message.link);
                break;
            
            case 'connect-device':
                await this.connectDevice(message.id, message.newWindow);
                break;
            
            case 'disconnect-device':
                await this.disconnectDevice(message.id);
                break;
            
            case 'setup-device':
                await this.setupDevice(message.id);
                break;
            
            case 'delete-device':
                await this.deleteDevice(message.id);
                break;
            
            case 'manage-apps':
                await this.manageApps(message.id);
                break;
            
            case 'register-dns':
                await this.registerDns(message.id);
                break;
            
            case 'pairing-details':
                await this.viewPairingDetails(message.groupId);
                break;

            case 'unpair-devices':
                await this.navigateToUnpairDevices(message.groupId);
                break;

            case 'check-device-reachability':
                await this.checkDeviceReachability(message.deviceId);
                break;
            case 'refresh-all-reachability':
                await this.refreshAllReachability();
                break;

            // Other message types are handled by the provider or services
        }
    }

    /**
     * Handle device selection
     */
    private async selectDevice(id: string): Promise<void> {
        this.logger.debug('device selected', { id });
        // Could navigate to details view or perform other actions
    }

    /**
     * Handle quick link click
     */
    private async handleLinkClick(link: string): Promise<void> {
        switch (link) {
            case 'docs':
                await this.openTechDocs();
                break;

            case 'templates':
                await this.templateGallery();
                break;

            case 'zrt-info':
                await this.showZrtInfoModal();
                break;
        }
    }

    /**
     * Show the ZRT info modal triggered from the corresponding Quick Links entry in the sidebar. 
     * Marks the entry's "New" badge as seen.
     */
    private async showZrtInfoModal(): Promise<void> {
        this.logger.info('Opening ZRT info modal from Quick Links');

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'external.zrt-info'
            }
        });

        await extensionStateService.setQuickLinkBadgeSeen('zrt-info');

        await this.navigateTo(DeviceManagerViewController.viewId(), {
            showZrtInfoModal: true,
            zrtLogoUri: this.lastRenderParams?.zrtLogoUri
        }, 'editor');
    }

    /**
     * Navigate to the template gallery
     */
    private async templateGallery(): Promise<void> {
        this.logger.info('Navigating to template gallery');
        await this.navigateTo(TemplateListViewController.viewId(), {}, 'editor');
    }

    /**
     * Open Z Toolkit technical documentation
     */
    private async openTechDocs(): Promise<void> {
        this.logger.info('Opening Z Toolkit technical documentation', { url: URLS.ZGX_DOCS });
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'external.docs'
            }
        });
        await vscode.env.openExternal(vscode.Uri.parse(URLS.ZGX_DOCS));
    }

    /**
     * Connect to a device via SSH
     */
    private async connectDevice(id: string, newWindow?: boolean): Promise<void> {
        this.logger.info('Connecting to device', { id, newWindow });

        const device = await this.deviceService.getDevice(id);
        if (device && !(await this.confirmIfAlreadyConnected(device))) {
            return;
        }

        if (!newWindow) {
            this.closeEditorIfShowing(AppSelectionViewController.viewId(), id);
        }

        try {
            await this.deviceService.connectToDevice(id, newWindow);
            this.logger.debug('Connection initiated', { id });
        } catch (error) {
            // Import DeviceNeedsSetupError type
            const { DeviceNeedsSetupError } = await import('../../../services/deviceService.js');
            
            // If device needs setup, navigate to setup flow
            if (error instanceof DeviceNeedsSetupError) {
                this.logger.info('device needs setup, navigating to setup flow', { 
                    id, 
                    deviceName: error.device.name 
                });
                
                // Navigate to setup options view in editor panel
                await this.navigateTo(SetupOptionsViewController.viewId(), { device: error.device }, 'editor');
                return;
            }
            
            this.logger.error('Failed to connect to device', { error, id });
            throw error;
        }
    }

    /**
     * If the device already has an active session (in this or another window), confirm with
     * the user before opening another one instead of silently proceeding.
     *
     * @returns true if it's fine to proceed (not connected, or user confirmed anyway)
     */
    private async confirmIfAlreadyConnected(device: { id: string; name: string }): Promise<boolean> {
        if (!connectionStateStore.get(device.id)) {
            return true;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Already connected to ${device.name}. Open another session anyway?`,
            { modal: true },
            'Open Anyway'
        );

        return confirmation === 'Open Anyway';
    }

    /**
     * Disconnect the current window from a device it is actively connected to.
     * Only ever invoked from the window that owns the session, since there is no supported
     * API for one window to close another window's remote connection.
     */
    private async disconnectDevice(id: string): Promise<void> {
        this.logger.info('Disconnecting from device', { id });

        const device = await this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for disconnect', { id });
            throw new Error(`device not found: ${id}`);
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Disconnect from ${device.name}?`,
            { modal: true },
            'Disconnect'
        );

        if (confirmation !== 'Disconnect') {
            this.logger.debug('device disconnect cancelled by user', { id });
            return;
        }

        const connectionState = connectionStateStore.get(id);
        if (connectionState?.windowId && connectionState.windowId !== vscode.env.sessionId) {
            const requested = await remoteSessionRegistryService.requestDisconnect(id, connectionState.windowId);
            if (!requested) {
                this.logger.debug('Remote session was no longer active when disconnect was requested', {
                    id,
                    targetWindowId: connectionState.windowId
                });
            }
            return;
        }

        await remoteSessionRegistryService.unregister(id, vscode.env.sessionId).catch(error =>
            this.logger.error('Failed to unregister active remote session on manual disconnect', { error, id })
        );

        // Re-check reachability now that the session is gone, so the status reflects reality.
        await deviceReachabilityCheckService.checkDevicesReachability([device]).catch(error =>
            this.logger.error('Failed to refresh device reachability after disconnect', { error, id })
        );

        try {
            await vscode.commands.executeCommand('workbench.action.remote.close');
        } catch (error) {
            this.logger.error('Failed to close remote connection', { error, id });
            vscode.window.showErrorMessage('Could not close the remote connection automatically. Please close this window manually.');
        }
    }

    /**
     * Navigate to SSH setup flow for a device
     */
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
            
            // Navigate to setup options view in editor panel
            await this.navigateTo(SetupOptionsViewController.viewId(), { device }, 'editor');
        } catch (error) {
            this.logger.error('Failed to start device setup', { error, id });
            throw error;
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
                this.logger.info('Device is part of a paired group, delegating to device manager', { id, groupId: group.id });
                // Navigate to the device manager editor panel which will show the warning overlay centered on screen
                await this.navigateTo(DeviceManagerViewController.viewId(), {
                    showDeleteWarningForDeviceId: id,
                    deleteWarningDeviceName: device.name,
                    deleteWarningGroupId: group.id
                }, 'editor');
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
            this.logger.debug('device deleted', { id, deviceName });
            await this.navigateTo(DeviceManagerViewController.viewId(), {}, 'editor');
        } catch (error) {
            this.logger.error('Failed to delete device', { error, id });
            throw error;
        }
    }

    /**
     * Navigate to pairing details view for a group
     */
    private async viewPairingDetails(groupId: string): Promise<void> {
        this.logger.info('Navigating to pairing details', { groupId });
        await this.navigateTo(PairDetailsViewController.viewId(), { groupId }, 'editor');
    }

    /**
     * Navigate to unpair devices view for a group
     */
    private async navigateToUnpairDevices(groupId: string): Promise<void> {
        this.logger.info('Navigating to unpair devices view', { groupId });
        const { UnpairDevicesViewController } = await import('../../groups/unpairDevices/unpairDevicesViewController.js');
        await this.navigateTo(UnpairDevicesViewController.viewId(), { groupId }, 'editor');
    }

    /**
     * Navigate to app management for a device
     */
    private async manageApps(id: string): Promise<void> {
        this.logger.info('Navigating to app management', { id });
        const device = await this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for app management', { id });
            throw new Error(`device not found: ${id}`);
        }
        await this.navigateTo(AppSelectionViewController.viewId(), { device }, 'editor');
    }

    /**
     * Navigate to DNS registration for a device
     */
    private async registerDns(id: string): Promise<void> {
        this.logger.info('Navigating to mDNS registration', { id });
        const device = await this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for mDNS registration', { id });
            throw new Error(`device not found: ${id}`);
        }
        await this.navigateTo(DnsRegistrationViewController.viewId(), { device, setupType: 'migration' }, 'editor');
    }

    /**
     * Check if a specific device is reachable over the network.
     * @param id The identifier of the device to check reachability for.
     */

    private async checkDeviceReachability(id: string): Promise<void> {
        const device = await this.deviceService.getDevice(id);
        if (!device) { return; }
        await deviceReachabilityCheckService.checkDevicesReachability([device], true);
    }

    /**
     * Refresh the reachability status for all devices.
     */ 

    private async refreshAllReachability(): Promise<void> {
        const devices = await this.deviceService.getAllDevices();
        await deviceReachabilityCheckService.checkDevicesReachability(devices, true);
    }

    dispose(): void {
        for (const unsubscribe of this.unsubscribes) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        super.dispose();
    }
}
