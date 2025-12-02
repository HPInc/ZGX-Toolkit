/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { IDeviceStore, Unsubscribe } from '../../../types/store';
import { Message } from '../../../types/messages';
import { Device } from '../../../types/devices';
import { URLS } from '../../../constants/config';
import * as vscode from 'vscode';
import { SetupOptionsViewController } from '../../setup/options/setupOptionsViewController';
import { AppSelectionViewController } from '../../apps/selection/appSelectionViewController';
import { DeviceService } from '../../../services';
import { TemplateListViewController } from '../../templates/templateListViewController';

/**
 * device list view for the sidebar.
 * Displays a compact list of devices with quick actions.
 * Subscribes to device store updates to automatically refresh when devices change.
 */
export class DeviceListViewController extends BaseViewController {
    private unsubscribe?: Unsubscribe;
    private deviceStore: IDeviceStore;
    private deviceService: DeviceService;
    private lastRenderParams?: any;

    public static viewId(): string {
        return 'devices/list';
    }

    constructor(deps: { 
        logger: Logger; 
        telemetry: ITelemetryService;
        deviceStore: IDeviceStore;
        deviceService: DeviceService;
    }) {
        super(deps.logger, deps.telemetry);
        this.deviceStore = deps.deviceStore;
        this.deviceService = deps.deviceService;
        
        // Load templates
        this.template = this.loadTemplate('./deviceList.html', __dirname);
        this.styles = this.loadTemplate('./deviceList.css', __dirname);
        this.clientScript = this.loadTemplate('./deviceList.js', __dirname);

        // Subscribe to device store updates
        this.unsubscribe = this.deviceStore.subscribe(() => {
            this.logger.trace('Device store updated, refreshing device list view');
            // Call refresh with last render params to update the webview
            this.refresh(this.lastRenderParams).catch(error => {
                this.logger.error('Failed to refresh device list view after store update', { error });
            });
        });
    }

    async render(params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering device list view');

        // Store params for later use in refresh
        this.lastRenderParams = params;

        const devices = this.deviceStore.getAll();
        
        // Prepare data for template
        const templateData = {
            devices: devices,
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
            const device = this.deviceService.getDevice(id);
            
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
     * Delete a device
     */
    private async deleteDevice(id: string): Promise<void> {
        this.logger.info('Deleting device', { id });

        try {
            const device = this.deviceService.getDevice(id);
            
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
            this.logger.debug('device deleted', { id, deviceName });
        } catch (error) {
            this.logger.error('Failed to delete device', { error, id });
            throw error;
        }
    }

    /**
     * Navigate to app management for a device
     */
    private async manageApps(id: string): Promise<void> {
        this.logger.info('Navigating to app management', { id });
        const device = this.deviceService.getDevice(id);
        if (!device) {
            this.logger.error('device not found for app management', { id });
            throw new Error(`device not found: ${id}`);
        }
        await this.navigateTo(AppSelectionViewController.viewId(), { device }, 'editor');
    }

    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        super.dispose();
    }
}
