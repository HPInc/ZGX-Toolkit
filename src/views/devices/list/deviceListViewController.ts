/*
 * Copyright ©2025 HP Development Company, L.P.
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
import { DeviceService, ConnectXGroupService } from '../../../services';
import { TemplateListViewController } from '../../templates/templateListViewController';
import { DnsRegistrationViewController } from '../../setup/dnsRegistration/dnsRegistrationViewController';
import { DeviceManagerViewController } from '../manager/deviceManagerViewController';
import { PairDetailsViewController } from '../../groups/pairDetails/pairDetailsViewController';

/**
 * Device list view for the sidebar.
 * Displays a compact list of devices with quick actions.
 * Subscribes to device store and group store updates to automatically refresh when devices or groups change.
 */
export class DeviceListViewController extends BaseViewController {
    private readonly unsubscribes: (() => void)[] = [];
    private readonly connectxGroupService: ConnectXGroupService;
    private readonly deviceService: DeviceService;
    private lastRenderParams?: any;

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
        this.template = this.loadTemplate('./deviceList.html', __dirname);
        this.styles = this.loadTemplate('./deviceList.css', __dirname);
        this.clientScript = this.loadTemplate('./deviceList.js', __dirname);

        // Register device list item partial for template reuse
        const deviceListItemPartial = this.loadTemplate('./deviceListItem.html', __dirname);
        Handlebars.registerPartial('deviceListItem', deviceListItemPartial);

        // Subscribe to device updates
        this.unsubscribes.push(this.deviceService.subscribe(() => {
            this.logger.trace('Device store updated, refreshing device list view');
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device list view after store update', { error });
            });
        }));

        // Subscribe to group store updates
        this.unsubscribes.push(this.connectxGroupService.subscribe(() => {
            this.logger.trace('Group store updated, refreshing device list view');
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device list view after group store update', { error });
            });
        }));
    }

    async render(params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering device list view');

        // Store params for later use in refresh
        this.lastRenderParams = params;

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

            return {
                ...device,
                needsDnsRegistration,
                isPaired: !!group,
                groupId: group?.id
            };
        });

        // Separate devices into paired groups and unpaired devices
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

        // Convert map to array
        const pairedGroups = Array.from(groupMap.entries()).map(([groupId, groupDevices]) => ({
            groupId,
            devices: groupDevices
        }));
        
        // Prepare data for template
        const templateData = {
            devices: devicesWithStatus,
            pairedGroups: pairedGroups.length > 0 ? pairedGroups : null,
            unpairedDevices: unpairedDevices.length > 0 ? unpairedDevices : null,
            pairedDeviceCount: pairedGroups.reduce((sum, g) => sum + g.devices.length, 0),
            unpairedDeviceCount: unpairedDevices.length,
            noDevices: devices.length === 0
        };

        const html = this.renderTemplate(this.template, templateData);
        
        // Track navigation
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'devices.list',
            },
            measurements: {
                deviceCount: devices.length,
                pairedGroupCount: pairedGroups.length,
                unpairedDeviceCount: unpairedDevices.length
            }
        });
        
        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

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
        }
    }

    /**
     * Navigate to the template gallery
     */
    private async templateGallery(): Promise<void> {
        this.logger.info('Navigating to template gallery');
        await this.navigateTo(TemplateListViewController.viewId(), {}, 'editor');
    }

    /**
     * Open ZGX technical documentation
     */
    private async openTechDocs(): Promise<void> {
        this.logger.info('Opening ZGX technical documentation', { url: URLS.ZGX_DOCS });
        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'external.docs',
            }
        });
        await vscode.env.openExternal(vscode.Uri.parse(URLS.ZGX_DOCS));
    }

    /**
     * Connect to a device via SSH
     */
    private async connectDevice(id: string, newWindow?: boolean): Promise<void> {
        this.logger.info('Connecting to device', { id, newWindow });

        try {
            await this.deviceService.connectToDevice(id, newWindow);
            this.logger.debug('Connection initiated', { id });
        } catch (error) {
            // Import DeviceNeedsSetupError type
            const { DeviceNeedsSetupError } = await import('../../../services/deviceService');
            
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
        const { UnpairDevicesViewController } = await import('../../groups/unpairDevices/unpairDevicesViewController');
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

    dispose(): void {
        for (const unsubscribe of this.unsubscribes) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        super.dispose();
    }
}
