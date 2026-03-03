/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../../types/telemetry';
import { Message } from '../../../types/messages';
import { ConnectXGroupService } from '../../../services';
import { DeviceManagerViewController } from '../../devices/manager/deviceManagerViewController';

/**
 * Network table entry representing a single row in the pair details table.
 * Each entry maps a device name to a specific ConnectX NIC and its IP address.
 */
interface NetworkTableEntry {
    deviceName: string;
    showDeviceName: boolean;
    nicName: string;
    ipAddress: string;
}

/**
 * Pair Details View - Displays ConnectX network interface information for paired devices.
 * Shows a read-only table of device names, ConnectX NIC names, and IP addresses.
 * Requires a groupId parameter to identify which group to display.
 */
export class PairDetailsViewController extends BaseViewController {
    public static viewId(): string {
        return 'groups/pairDetails';
    }

    private readonly groupService: ConnectXGroupService;
    private groupId: string | undefined;

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        connectxGroupService: ConnectXGroupService;
    }) {
        super(deps.logger, deps.telemetry);

        this.groupService = deps.connectxGroupService;

        this.template = this.loadTemplate('./pairDetails.html', __dirname);
        this.styles = this.loadTemplate('./pairDetails.css', __dirname);
        this.clientScript = this.loadTemplate('./pairDetails.js', __dirname);
    }

    async render(params?: any, nonce?: string): Promise<string> {
        this.logger.debug('Rendering pair details view', params);

        // Store the groupId from params for later use
        this.groupId = params?.groupId;

        const networkEntries = await this.loadNetworkEntries();
        const hasData = networkEntries.length > 0;

        const data = {
            hasData,
            networkEntries
        };

        const html = this.renderTemplate(this.template, data);

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'groups.pairDetails',
            },
            measurements: {
                networkEntryCount: networkEntries.length
            }
        });

        return this.wrapHtml(html, nonce);
    }

    /**
     * Load network entries for the current group.
     * Returns an empty array if no groupId is set or if loading fails.
     */
    private async loadNetworkEntries(): Promise<NetworkTableEntry[]> {
        if (!this.groupId) {
            this.logger.warn('No groupId provided to pair details view');
            return [];
        }

        try {
            const groupInfo = await this.groupService.getGroupInfo(this.groupId);
            if (!groupInfo) {
                return [];
            }

            const entries: NetworkTableEntry[] = [];
            for (const device of groupInfo.devices) {
                const deviceEntries = await this.discoverNICsForDevice(device);
                entries.push(...deviceEntries);
            }
            return entries;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to load pair details', { groupId: this.groupId, error: errorMsg });
            return [];
        }
    }

    /**
     * Discover ConnectX NICs for a single device and return table entries.
     * Returns a fallback entry if no NICs with IPs are found or if discovery fails.
     */
    private async discoverNICsForDevice(device: { name: string }): Promise<NetworkTableEntry[]> {
        try {
            const nics = await this.groupService.getConnectXNICsForDevice(device as any);
            const nicsWithIp = nics.filter(nic => nic.ipv4Address);

            if (nicsWithIp.length > 0) {
                return nicsWithIp.map((nic, i) => ({
                    deviceName: device.name,
                    showDeviceName: i === 0,
                    nicName: nic.linuxDeviceName,
                    ipAddress: nic.ipv4Address
                }));
            }

            return [{
                deviceName: device.name,
                showDeviceName: true,
                nicName: 'No ConnectX NIC with IP found',
                ipAddress: '-'
            }];
        } catch (nicError) {
            const errorMsg = nicError instanceof Error ? nicError.message : String(nicError);
            this.logger.error('Failed to discover ConnectX NICs for device', {
                device: device.name,
                error: errorMsg
            });

            return [{
                deviceName: device.name,
                showDeviceName: true,
                nicName: 'Error discovering NICs',
                ipAddress: '-'
            }];
        }
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        if (message.type === 'cancel') {
            this.logger.debug('Pair details closed, navigating to device manager');
            await this.navigateTo(DeviceManagerViewController.viewId());
        } else {
            this.logger.warn('Unknown message type', { type: (message as any).type });
        }
    }
}
