/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Message } from '../../../types/messages';
import { Device } from '../../../types/devices';
import { SetupOptionsViewController } from '../../setup/options/setupOptionsViewController';
import { AppSelectionViewController } from '../../apps/selection/appSelectionViewController';
import { DeviceDiscoveryService, DeviceService } from '../../../services';

/**
 * device Manager View - Full editor view for managing devices.
 * Shows device list with add/edit forms and discovery functionality.
 * Subscribes to device store updates to automatically refresh when devices change.
 */
export class DeviceManagerViewController extends BaseViewController {
    private unsubscribe?: () => void;
    private editingDeviceId?: string;
    private showForm: boolean = false;
    private lastRenderParams?: { showAddForm?: boolean; editDeviceId?: string };

    public static viewId(): string {
        return 'devices/manager';
    }

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        deviceService: DeviceService;
        deviceDiscoveryService: DeviceDiscoveryService;
    }) {
        super(deps.logger, deps.telemetry);

        this.deviceService = deps.deviceService;
        this.deviceDiscoveryService = deps.deviceDiscoveryService;

        this.template = this.loadTemplate('./deviceManager.html', __dirname);
        this.styles = this.loadTemplate('./deviceManager.css', __dirname);
        this.clientScript = this.loadTemplate('./deviceManager.js', __dirname);

        // Subscribe to device updates
        this.unsubscribe = this.deviceService.subscribe(() => {
            this.logger.trace('Device store updated, refreshing device manager view');
            // Call refresh with last render params to update the webview
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device manager view after store update', { error });
            });
        });
    }

    private deviceService: DeviceService;
    private deviceDiscoveryService: DeviceDiscoveryService;

    async render(params?: { showAddForm?: boolean; editDeviceId?: string }, nonce?: string): Promise<string> {
        this.logger.debug('Rendering device manager view', params);

        // Store params for later use in refresh
        this.lastRenderParams = params;

        const devices = await this.deviceService.getAllDevices();  

        // Add DNS registration status to each device based on dnsInstanceName property
        const devicesWithDnsStatus = devices.map((device) => {
            const needsDnsRegistration = device.isSetup && 
                                        device.useKeyAuth && 
                                        device.keySetup?.connectionTested &&
                                        (device.dnsInstanceName === undefined ||
                                         device.dnsInstanceName === null ||
                                         device.dnsInstanceName.trim().length === 0);
            
            return {
                ...device,
                needsDnsRegistration
            };
        });
        
        this.showForm = params?.showAddForm || devices.length === 0 || !!params?.editDeviceId;
        this.editingDeviceId = params?.editDeviceId;

        let editingDevice: Device | undefined;
        if (this.editingDeviceId) {
            editingDevice = await this.deviceService.getDevice(this.editingDeviceId);
        }

        const data = {
            devices: devicesWithDnsStatus.length > 0 ? devicesWithDnsStatus : null,
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
        };

        const html = this.renderTemplate(this.template, data);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'devices.manager',
            },
            measurements: {
                deviceCount: devices.length,
            }
        });

        return this.wrapHtml(html, nonce);
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
            case 'refresh':
                this.refresh(this.lastRenderParams).catch(error => {
                    this.logger.error('Failed to refresh device manager view', { error });
                });
                break;
        }
    }

    private async createDevice(data: any): Promise<void> {
        this.logger.info('Creating device', { name: data.name });

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

        try {
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

    private async deleteDevice(id: string): Promise<void> {
        this.logger.info('Deleting device', { id });

        try {
            const device = await this.deviceService.getDevice(id);
            
            if (!device) {
                this.logger.error('device not found for deletion', { id });
                throw new Error(`device not found: ${id}`);
            }

            // Show VS Code confirmation dialog
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
        const { DnsRegistrationViewController } = await import('../../setup/dnsRegistration/dnsRegistrationViewController');
        await this.navigateTo(DnsRegistrationViewController.viewId(), { device, setupType: 'migration' }, 'editor');
    }

    private async discoverDevices(options?: any): Promise<void> {
        this.logger.info('Starting device discovery', options);

        try {
            // Notify webview that discovery has started
            this.sendMessageToWebview({
                type: 'discoveryStarted'
            });

            // Perform discovery
            const devices = await this.deviceDiscoveryService.discoverDevices(options);
            this.logger.info('Discovery completed', { count: devices.length });

            // Send results back to webview
            this.sendMessageToWebview({
                type: 'discoveryCompleted',
                devices: devices
            });
        } catch (error) {
            this.logger.error('Discovery failed', { error });

            // Send error to webview
            this.sendMessageToWebview({
                type: 'discoveryError',
                error: error instanceof Error ? error.message : 'Discovery failed'
            });
        }
    }

    /**
     * Rediscover a specific device by its DNS instance name.
     */
    private async rediscoverDevice(deviceId: string, dnsInstanceName: string, timeoutMs?: number): Promise<void> {
        this.logger.info('Starting device rediscovery', { deviceId, dnsInstanceName, timeoutMs });

        try {
            // Notify webview that discovery has started
            this.sendMessageToWebview({
                type: 'discoveryStarted'
            });

            // Perform rediscovery for this specific device
            const devices = await this.deviceDiscoveryService.rediscoverDevices([dnsInstanceName], timeoutMs);
            this.logger.info('Device rediscovery completed', { deviceId, count: devices.length });

            // Send results back to webview
            this.sendMessageToWebview({
                type: 'discoveryCompleted',
                devices: devices
            });
        } catch (error) {
            this.logger.error('Device rediscovery failed', { deviceId, error });

            // Send error to webview
            this.sendMessageToWebview({
                type: 'discoveryError',
                error: error instanceof Error ? error.message : 'Device rediscovery failed'
            });
        }
    }

    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        super.dispose();
    }
}
