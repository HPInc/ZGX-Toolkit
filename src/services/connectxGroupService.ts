/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Service for managing ConnectX Groups.
 * Handles grouping devices together for coordinated operations.
 * Groups must contain at least 2 devices; groups with fewer devices are automatically deleted.
 */

import * as crypto from 'node:crypto';
import { Client as SSHClient } from 'ssh2';
import { logger } from '../utils/logger';
import {
    ConnectXGroup,
    ConnectXGroupConfig,
    ConnectXGroupInfo,
    ConnectXGroupOperationResult,
    ConnectXNIC
} from '../types/connectxGroup';
import { Device } from '../types/devices';
import { deviceService, DeviceService } from './deviceService';
import { groupStore, GroupStore } from '../store/groupStore';
import { ITelemetryService, TelemetryEventType } from '../types/telemetry';
import { telemetryService } from './telemetryService';
import { createSSHConnection, executeCommandOnClient } from '../utils/sshConnection';

/**
 * Configuration for the GroupService.
 */
export interface GroupServiceConfig {
    store: GroupStore;
    telemetry: ITelemetryService;
}

/**
 * Minimum number of devices required in a group
 */
const MIN_GROUP_SIZE = 2;
const NETPLAN_CONNECTX_CONFIG_PATH = '/etc/netplan/40-zgx-connectx.yaml';

export class ConnectXGroupService {
    private readonly deviceService: DeviceService;
    private readonly config: GroupServiceConfig;

    constructor(deviceService: DeviceService, config: GroupServiceConfig) {
        this.deviceService = deviceService;
        this.config = config;
    }

    /**
     * Create a new ConnectX Group with at least 2 devices.
     * 
     * @param config Configuration for the new group
     * @returns Operation result with the created group
     */
    public async createGroup(groupConfig: ConnectXGroupConfig): Promise<ConnectXGroupOperationResult> {
        try {
            // Validate group configuration
            await this.validateGroupConfig(groupConfig);

            // Create the group
            const group: ConnectXGroup = {
                id: this.generateId(),
                deviceIds: [...groupConfig.deviceIds],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: groupConfig.metadata
            };

            this.config.store.set(group.id, group);

            logger.info('ConnectX Group created', {
                groupId: group.id,
                deviceCount: group.deviceIds.length
            });
            
            this.config.telemetry.trackEvent({
                eventType: TelemetryEventType.Group,
                action: 'create',
            });

            return {
                success: true,
                group: group,
                message: `Group "${group.id}" created with ${group.deviceIds.length} devices`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to create ConnectX Group', { error: errorMessage });
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'group.create' });
            
            return {
                success: false,
                error: errorMessage,
                message: 'Failed to create group'
            };
        }
    }

    /**
     * Create a new ConnectX Group and configure ConnectX NICs for all devices in the group.
     * If NIC configuration fails, the group is automatically rolled back (removed from the store).
     *
     * @param groupConfig Configuration for the new group (device IDs, optional metadata)
     * @param password Sudo password used to configure each device
     * @returns Operation result indicating success or failure, including the created group on success
     */
    public async createGroupAndConfigureNICs(groupConfig: ConnectXGroupConfig, password: string): Promise<ConnectXGroupOperationResult> {
        // Create the group first
        const creationResult = await this.createGroup(groupConfig);
        if (!creationResult.success || !creationResult.group) {
            return creationResult; // Return failure result if group creation failed
        }

        // If group creation succeeded, proceed to configure NICs for the group
        const group = creationResult.group;
        try {
            await this.configureConnectXNICsForGroup(group.id, password);
            return {
                success: true,
                group: group,
                message: `Created group and configured ConnectX NICs for all devices`
            };
        } catch (error) {
            // Roll back group creation if NIC configuration fails.
            // Make a best effort to unconfigure any devices that were successfully configured before the failure.
            try {
                await this.unconfigureConnectXNICsForGroup(group.id, password);
                logger.info('Devices unconfigured after NIC configuration failure', { groupId: group.id });
            } catch (unconfigureError) {
                const unconfigureErrorMessage = unconfigureError instanceof Error ? unconfigureError.message : String(unconfigureError);
                logger.error('Failed to unconfigure devices after NIC configuration failure', { groupId: group.id, error: unconfigureErrorMessage });
            }
            // Remove group.
            try {
                await this.removeGroup(group.id);
                logger.info('Group rolled back after NIC configuration failure', { groupId: group.id });
            } catch (removeError) {
                const removeErrorMessage = removeError instanceof Error ? removeError.message : String(removeError);
                logger.error('Failed to roll back group after NIC configuration failure', { groupId: group.id, error: removeErrorMessage });
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to configure ConnectX NICs after group creation', { groupId: group.id, error: errorMessage });
            const telemetryError = error instanceof Error ? error : new Error(errorMessage);
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: telemetryError, context: 'group.createAndConfigure' });
            
            return {
                success: false,
                group: group,
                error: `Failed to configure ConnectX NICs for devices in group: ${errorMessage}`,
                message: `Failed to configure ConnectX NICs for devices in group. Group creation has been rolled back.`
            };
        }
    }

    /**
     * Add a device to an existing group.
     * 
     * @param groupId ID of the group to add device to
     * @param deviceId ID of the device to add
     * @returns Operation result
     */
    public async addDeviceToGroup(groupId: string, deviceId: string): Promise<ConnectXGroupOperationResult> {
        try {
            const group = this.config.store.get(groupId);
            if (!group) {
                return {
                    success: false,
                    error: `Group not found: ${groupId}`,
                    message: 'Group does not exist'
                };
            }

            // Check if device exists
            const device = await this.deviceService.getDevice(deviceId);
            if (!device) {
                return {
                    success: false,
                    error: `Device to be added to group not found: ${deviceId}`,
                    message: 'Device to be added does not exist'
                };
            }

            // Check if device is already in this group
            if (group.deviceIds.includes(deviceId)) {
                return {
                    success: false,
                    error: `Device ${deviceId} is already in group ${group.id}`,
                    message: 'Device is already in this group'
                };
            }

            // Check if device is in another group
            if (await this.isDeviceInAnyGroup(deviceId)) {
                return {
                    success: false,
                    error: `Device ${deviceId} is already in another group`,
                    message: 'Device is in another group'
                };
            }

            // Create updated group with new device (immutable update)
            const updatedGroup: ConnectXGroup = {
                ...group,
                deviceIds: [...group.deviceIds, deviceId],
                updatedAt: new Date().toISOString()
            };

            this.config.store.set(updatedGroup.id, updatedGroup);

            logger.info('Device added to ConnectX Group', {
                groupId: updatedGroup.id,
                deviceId: deviceId,
                deviceCount: updatedGroup.deviceIds.length
            });

            this.config.telemetry.trackEvent({
                eventType: TelemetryEventType.Group,
                action: 'add-device',
            });

            return {
                success: true,
                group: updatedGroup,
                message: `Device added to group "${updatedGroup.id}"`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to add device to group', { error: errorMessage });
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'group.addDevice' });
            
            return {
                success: false,
                error: errorMessage,
                message: 'Failed to add device to group'
            };
        }
    }

    /**
     * Remove a device from a group.
     * If the group has fewer than 2 devices after removal, the group is deleted.
     * 
     * @param groupId ID of the group to remove device from
     * @param deviceId ID of the device to remove
     * @returns Operation result
     */
    public async removeDeviceFromGroup(groupId: string, deviceId: string): Promise<ConnectXGroupOperationResult> {
        try {
            const group = this.config.store.get(groupId);
            if (!group) {
                return {
                    success: false,
                    error: `Group not found: ${groupId}`,
                    message: 'Group does not exist'
                };
            }

            // Check if device is in this group
            const deviceIndex = group.deviceIds.indexOf(deviceId);
            if (deviceIndex === -1) {
                return {
                    success: false,
                    error: `Device ${deviceId} is not in group ${group.id}`,
                    message: 'Device not in group'
                };
            }

            // Filter out the device to be removed
            const updatedDeviceIds = group.deviceIds.filter(id => id !== deviceId);

            // Check if group should be deleted
            if (updatedDeviceIds.length < MIN_GROUP_SIZE) {
                this.config.store.delete(groupId);

                logger.info('Device removed and group deleted (fewer than minimum devices)', {
                    groupId: group.id,
                    deviceId: deviceId,
                    remainingDevices: updatedDeviceIds.length
                });

                this.config.telemetry.trackEvent({
                    eventType: TelemetryEventType.Group,
                    action: 'remove-device',
                });

                return {
                    success: true,
                    message: `Device removed and group "${group.id}" deleted (fewer than ${MIN_GROUP_SIZE} devices remaining)`
                };
            }

            // Create updated group with device removed (immutable update)
            const updatedGroup: ConnectXGroup = {
                ...group,
                deviceIds: updatedDeviceIds,
                updatedAt: new Date().toISOString()
            };

            // Save the valid updated group
            this.config.store.set(updatedGroup.id, updatedGroup);

            logger.info('Device removed from ConnectX Group', {
                groupId: updatedGroup.id,
                deviceId: deviceId,
                deviceCount: updatedGroup.deviceIds.length
            });

            this.config.telemetry.trackEvent({
                eventType: TelemetryEventType.Group,
                action: 'remove-device',
            });

            return {
                success: true,
                group: updatedGroup,
                message: `Device removed from group "${updatedGroup.id}"`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to remove device from group', { error: errorMessage });
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'group.removeDevice' });
            
            return {
                success: false,
                error: errorMessage,
                message: 'Failed to remove device from group'
            };
        }
    }

    /**
     * Remove a group and ungroup all devices.
     * 
     * @param groupId ID of the group to remove
     * @returns Operation result
     */
    public async removeGroup(groupId: string): Promise<ConnectXGroupOperationResult> {
        try {
            const group = this.config.store.get(groupId);
            if (!group) {
                return {
                    success: false,
                    error: `Group not found: ${groupId}`,
                    message: 'Group does not exist'
                };
            }

            const deviceCount = group.deviceIds.length;

            this.config.store.delete(groupId);

            logger.info('ConnectX Group removed', {
                groupId: groupId,
                deviceCount: deviceCount
            });

            this.config.telemetry.trackEvent({
                eventType: TelemetryEventType.Group,
                action: 'remove',
            });

            return {
                success: true,
                message: `Group "${groupId}" removed. ${deviceCount} device(s) ungrouped`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to remove group', { error: errorMessage });
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'group.remove' });
            
            return {
                success: false,
                error: errorMessage,
                message: 'Failed to remove group'
            };
        }
    }

    /**
     * Remove a group and unconfigure ConnectX NICs for all devices in the group.
     *
     * First attempts to unconfigure NICs on every device in the group.
     * Then, regardless of whether unconfiguration succeeded, removes the group from the store.
     * If there was an error during unconfiguration, it is included in the result as a non-fatal error.
     *
     * @param groupId ID of the group to remove
     * @param password Sudo password used for NIC unconfiguration on each device
     * @returns Operation result indicating success or failure
     */
    public async removeGroupAndUnconfigureNICs(groupId: string, password: string): Promise<ConnectXGroupOperationResult> {
        // Verify group exists before proceeding
        const group = this.config.store.get(groupId);
        if (!group) {
            return {
                success: false,
                error: `Group not found: ${groupId}`,
                message: 'Group does not exist'
            };
        }

        // First, attempt to unconfigure NICs for all devices in the group
        let unconfigureError: string | undefined;
        try {
            await this.unconfigureConnectXNICsForGroup(groupId, password);
        } catch (error) {
            unconfigureError = error instanceof Error ? error.message : String(error);
            logger.error('Failed to unconfigure ConnectX NICs for group', { groupId, error: unconfigureError });
        }

        // Then, regardless of unconfiguration success, remove the group
        const removeResult = await this.removeGroup(groupId);
        if (!removeResult.success) {
            this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: new Error(removeResult.error), context: 'group.removeAndUnconfigure' });
            return {
                success: false,
                error: removeResult.error,
                message: 'Failed to remove group'
            };
        }

        return {
            success: true,
            nonFatalError: unconfigureError,
            message: `Devices ungrouped. ${unconfigureError ? 'However, there were issues unconfiguring ConnectX NICs on one or more of the devices.' : ''}`
        };
    }

    /**
     * Get detailed information about a group including device details.
     * Automatically cleans up the group if it has fewer than the minimum valid devices.
     * 
     * @param groupId ID of the group
     * @returns Group information with device details, or undefined if not found or cleaned up
     */
    public async getGroupInfo(groupId: string): Promise<ConnectXGroupInfo | undefined> {
        const group = this.config.store.get(groupId);
        if (!group) {
            return undefined;
        }

        // Fetch all device details
        const devices = await Promise.all(
            group.deviceIds.map(id => this.deviceService.getDevice(id))
        );

        // Filter out any null devices (in case a device was deleted)
        const validDevices = devices.filter((device): device is Device => device !== null);

        // Clean up group if it has fewer than minimum required devices
        if (validDevices.length < MIN_GROUP_SIZE) {
            logger.warn('Group has insufficient valid devices, removing group', {
                groupId: group.id,
                originalDeviceCount: group.deviceIds.length,
                validDeviceCount: validDevices.length
            });
            await this.removeGroup(groupId);
            return undefined;
        }

        return {
            group: group,
            devices: validDevices
        };
    }

    /**
     * Get a group by ID.
     * 
     * @param groupId ID of the group
     * @returns The group or undefined if not found
     */
    public async getGroup(groupId: string): Promise<ConnectXGroup | undefined> {
        return this.config.store.get(groupId);
    }

    /**
     * Get all groups.
     * 
     * @returns Array of all groups
     */
    public async getAllGroups(): Promise<ConnectXGroup[]> {
        return this.config.store.getAll();
    }

    /**
     * Get the group that contains a specific device.
     * 
     * @param deviceId ID of the device
     * @returns The group containing the device, or undefined if not in any group
     */
    public async getGroupForDevice(deviceId: string): Promise<ConnectXGroup | undefined> {
        return this.config.store.findByDevice(deviceId);
    }

    /**
     * Check if a device is in any group.
     * 
     * @param deviceId ID of the device
     * @returns True if device is in a group, false otherwise
     */
    public async isDeviceInAnyGroup(deviceId: string): Promise<boolean> {
        return (await this.getGroupForDevice(deviceId)) !== undefined;
    }

    /**
     * Subscribe to group store changes.
     * 
     * @param listener Callback function to invoke when groups change
     * @returns Unsubscribe function to stop receiving updates
     */
    public subscribe(listener: (groups: ConnectXGroup[]) => void): () => void {
        return this.config.store.subscribe(listener);
    }

    /**
     * Generate a unique ID for a new group.
     * Uses cryptographically secure random bytes for uniqueness.
     * 
     * @returns Unique group identifier
     */
    private generateId(): string {
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(6).toString('hex');
        return `group-${timestamp}-${randomBytes}`;
    }

    /**
     * Validate group configuration before creating a group.
     * 
     * @param config Group configuration to validate
     * @throws Error if validation fails
     */
    private async validateGroupConfig(config: ConnectXGroupConfig): Promise<void> {
        // Validate device count
        if (config.deviceIds.length < MIN_GROUP_SIZE) {
            const error = `A group must contain at least ${MIN_GROUP_SIZE} devices. Provided: ${config.deviceIds.length}`;
            logger.warn('Group configuration validation failed', { error: 'insufficient devices', count: config.deviceIds.length });
            throw new Error(error);
        }

        // Check for duplicate device IDs
        const uniqueDeviceIds = new Set(config.deviceIds);
        if (uniqueDeviceIds.size !== config.deviceIds.length) {
            const error = 'Device IDs must be unique within a group';
            logger.warn('Group configuration validation failed', { error: 'duplicate devices', deviceIds: config.deviceIds });
            throw new Error(error);
        }

        // Verify all devices exist
        const deviceExistenceChecks = await Promise.all(
            config.deviceIds.map(deviceId => this.deviceService.getDevice(deviceId))
        );
        
        const missingDevices = config.deviceIds.filter((deviceId, index) => deviceExistenceChecks[index] === null);
        
        if (missingDevices.length > 0) {
            const error = `Devices not found: ${missingDevices.join(', ')}`;
            logger.warn('Group configuration validation failed', { error: 'devices not found', devices: missingDevices });
            throw new Error(error);
        }

        // Check if any devices are already in other groups
        const deviceChecks = await Promise.all(
            config.deviceIds.map(deviceId => this.isDeviceInAnyGroup(deviceId))
        );
        
        const devicesInGroups = config.deviceIds.filter((_, index) => deviceChecks[index]);

        if (devicesInGroups.length > 0) {
            const error = `Devices already in groups: ${devicesInGroups.join(', ')}`;
            logger.warn('Group configuration validation failed', { error: 'devices in existing groups', devices: devicesInGroups });
            throw new Error(error);
        }
    }

    /**
     * Discover ConnectX NICs on a device via SSH. Connects to the device and runs commands to find ConnectX/Mellanox NICs
     * and their associated IPv4 addresses. For devices that do not have ConnectX NICs, an empty array is returned.
     * It is also possible to be present but have no assigned IP address (i.e. it isn't plugged in).
     * 
     * @param device Device to discover ConnectX NICs on
     * @returns an array of ConnectXNIC objects representing the discovered NICs
     * @throws Error if SSH connection fails or if command execution/parsing fails
     */
    public async getConnectXNICsForDevice(device: Device): Promise<ConnectXNIC[]> {
        logger.debug('Discovering ConnectX NICs for device', { device: device.name });

        let client: SSHClient | undefined;
        try {
            // Create a single SSH connection for all operations
            try {
                client = await createSSHConnection(device, { readyTimeout: 10000, timeout: 10000 });
            } catch (connectionError) {
                const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
                logger.error('SSH connection failed during ConnectX NIC discovery', {
                    device: device.name,
                    error: errorMessage
                });
                throw new Error(`Failed to establish SSH connection to ${device.name}: ${errorMessage}`);
            }

            // Discover ConnectX NICs using lshw
            const lshwCommand = 'lshw -class network -json';
            const lshwResult = await executeCommandOnClient(
                client,
                lshwCommand,
                { operationName: 'Discover ConnectX NICs', timeoutSeconds: 15 }
            );

            if (!lshwResult.success) {
                const errorMessage = `lshw command failed: ${lshwResult.stderr}`;
                logger.error('Failed to discover NICs via lshw', {
                    device: device.name,
                    error: lshwResult.stderr
                });
                throw new Error(`Failed to discover NICs on ${device.name}: ${errorMessage}`);
            }

            // Parse JSON output
            let networkInterfaces: any[];
            try {
                const parsed = JSON.parse(lshwResult.stdout);
                // lshw can return either an array or a single object
                networkInterfaces = Array.isArray(parsed) ? parsed : [parsed];
            } catch (parseError) {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                logger.error('Failed to parse lshw JSON output', {
                    device: device.name,
                    error: errorMessage
                });
                throw new Error(`Failed to parse lshw output for ${device.name}: ${errorMessage}`);
            }

            // Filter for Mellanox ConnectX NICs
            const mellanoxNICs = networkInterfaces.filter(nic => {
                const product = nic.product?.toLowerCase() || '';
                const vendor = nic.vendor?.toLowerCase() || '';
                const logicalName = nic.logicalname || '';

                // Must have Mellanox in product or vendor
                const isMellanox = product.includes('mellanox') || vendor.includes('mellanox');
                
                // Must have a logical name that starts with "enp" (lowercase)
                const hasValidName = typeof logicalName === 'string' && logicalName.startsWith('enp');

                return isMellanox && hasValidName;
            });

            logger.debug('Found Mellanox ConnectX NICs', {
                device: device.name,
                count: mellanoxNICs.length,
                nics: mellanoxNICs.map(nic => nic.logicalname)
            });

            // If no ConnectX NICs found, return empty array (this is a valid result)
            if (mellanoxNICs.length === 0) {
                logger.info('No ConnectX NICs found on device', {
                    device: device.name
                });
                return [];
            }

            // Get IPv4 addresses for each NIC using the same connection
            const connectXNICs: ConnectXNIC[] = [];

            for (const nic of mellanoxNICs) {
                const linuxDeviceName = nic.logicalname;
                
                // Get IPv4 address
                const ipCommand = `ip a l ${linuxDeviceName} | awk '/inet / {print $2}'`;
                const ipResult = await executeCommandOnClient(
                    client,
                    ipCommand,
                    { operationName: `Get IP for ${linuxDeviceName}`, timeoutSeconds: 10 }
                );

                let ipv4Address = '';
                if (ipResult.success && ipResult.stdout.trim()) {
                    // Extract just the IP address without CIDR notation
                    const ipWithCidr = ipResult.stdout.trim().split('\n')[0];
                    ipv4Address = ipWithCidr.split('/')[0];
                } else if (!ipResult.success) {
                    logger.debug('Could not get IP address for NIC (may not have IP assigned)', {
                        device: device.name,
                        nic: linuxDeviceName,
                        error: ipResult.stderr
                    });
                }

                connectXNICs.push({
                    linuxDeviceName,
                    ipv4Address
                });

                logger.debug('ConnectX NIC discovered', {
                    device: device.name,
                    linuxDeviceName,
                    ipv4Address: ipv4Address || 'none'
                });
            }

            logger.info('ConnectX NIC discovery complete', {
                device: device.name,
                nicCount: connectXNICs.length
            });

            return connectXNICs;

        } finally {
            // Always close the SSH connection
            if (client) {
                try {
                    client.end();
                } catch (err) {
                    logger.debug('Error closing SSH client for ConnectX NIC discovery', {
                        device: device.name,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }
    }

    /**
     * Configure ConnectX NICs on a device for link-local IPv4 addressing.
     * Creates a netplan configuration file and applies it to enable link-local addressing on all ConnectX NICs.
     * 
     * @param device Device to configure ConnectX NICs on
     * @param password Sudo password for the device
     * @throws Error if no NICs are found, SSH connection fails, or configuration fails
     */
    public async configureConnectXNICsForDevice(device: Device, password: string): Promise<void> {
        logger.info('Configuring ConnectX NICs for device', { device: device.name });

        // Discover ConnectX NICs on the device
        const nics = await this.getConnectXNICsForDevice(device);

        // Validate that NICs were found
        if (nics.length === 0) {
            const errorMessage = `No ConnectX NICs found on device ${device.name}. Cannot configure.`;
            logger.error('Cannot configure ConnectX NICs - none found', {
                device: device.name
            });
            throw new Error(errorMessage);
        }

        logger.debug('Configuring netplan for ConnectX NICs', {
            device: device.name,
            nicCount: nics.length,
            nics: nics.map(n => n.linuxDeviceName)
        });

        // Create SSH connection
        let client: SSHClient | undefined;
        try {
            try {
                client = await createSSHConnection(device, { readyTimeout: 10000, timeout: 10000 });
            } catch (connectionError) {
                const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
                logger.error('SSH connection failed during ConnectX NIC configuration', {
                    device: device.name,
                    error: errorMessage
                });
                throw new Error(`Failed to establish SSH connection to ${device.name}: ${errorMessage}`);
            }

            // Build netplan configuration content
            const netplanConfig = this.buildNetplanConfig(nics);

            logger.debug('Writing netplan configuration file', {
                device: device.name,
                path: NETPLAN_CONNECTX_CONFIG_PATH
            });

            // Write the netplan configuration file with proper permissions
            const escapedConfig = netplanConfig
                .replaceAll('\'', String.raw`'\''`); // Escape single quotes for safe use in a single-quoted shell string
            const writeCommand = `sudo -S sh -c "echo '${escapedConfig}' > ${NETPLAN_CONNECTX_CONFIG_PATH} && chmod 600 ${NETPLAN_CONNECTX_CONFIG_PATH}"`;
            
            const writeResult = await executeCommandOnClient(
                client,
                writeCommand,
                { 
                    operationName: 'Write netplan config', 
                    timeoutSeconds: 15,
                    sudoPassword: password
                }
            );

            if (!writeResult.success) {
                const errorMessage = `Failed to write netplan configuration file: ${writeResult.stderr}`;
                logger.error('Failed to write netplan configuration', {
                    device: device.name,
                    error: writeResult.stderr
                });
                throw new Error(`Failed to write netplan configuration on ${device.name}: ${errorMessage}`);
            }

            logger.debug('Netplan configuration file written successfully', {
                device: device.name
            });

            // Apply the netplan configuration
            logger.debug('Applying netplan configuration', {
                device: device.name
            });

            const applyCommand = 'sudo -S netplan apply';
            const applyResult = await executeCommandOnClient(
                client,
                applyCommand,
                { 
                    operationName: 'Apply netplan config', 
                    timeoutSeconds: 30,
                    sudoPassword: password
                }
            );

            if (!applyResult.success) {
                const errorMessage = `Failed to apply netplan configuration: ${applyResult.stderr}`;
                logger.error('Failed to apply netplan configuration', {
                    device: device.name,
                    error: applyResult.stderr
                });
                throw new Error(`Failed to apply netplan configuration on ${device.name}: ${errorMessage}`);
            }

            logger.info('ConnectX NICs configured successfully', {
                device: device.name,
                nicCount: nics.length
            });

        } finally {
            // Close SSH connection
            if (client) {
                try {
                    client.end();
                } catch (err) {
                    logger.debug('Error closing SSH client for ConnectX NIC configuration', {
                        device: device.name,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }
    }

    /**
     * Configure ConnectX NICs for every device in a group.
     *
     * Resolves all devices in the group, then invokes `configureConnectXNICsForDevice()` sequentially.
     * If any device fails configuration, an aggregated error is thrown after all attempts complete.
     *
     * @param groupId ID of the group whose devices should be configured
     * @param password Sudo password used for netplan configuration on each device
     * @throws Error if the group or any device is missing, or if any device fails to configure
     */
    public async configureConnectXNICsForGroup(groupId: string, password: string): Promise<void> {
        const group = this.config.store.get(groupId);
        if (!group) {
            throw new Error(`Group not found: ${groupId}`);
        }

        logger.info('Configuring ConnectX NICs for devices in group', {
            groupId: group.id,
            deviceCount: group.deviceIds.length
        });

        const deviceResults = await Promise.all(
            group.deviceIds.map(deviceId => this.deviceService.getDevice(deviceId))
        );

        const missingDevices = group.deviceIds.filter((deviceId, index) => deviceResults[index] === null);
        if (missingDevices.length > 0) {
            throw new Error(`Devices not found in group ${groupId}: ${missingDevices.join(', ')}`);
        }

        const devices = deviceResults.filter((device): device is Device => device !== null);
        const failures: Array<{ deviceId: string; deviceName: string; error: string }> = [];

        for (const device of devices) {
            try {
                await this.configureConnectXNICsForDevice(device, password);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error('Failed to configure ConnectX NICs for device in group', {
                    groupId: group.id,
                    deviceId: device.id,
                    deviceName: device.name,
                    error: errorMessage
                });
                failures.push({ deviceId: device.id, deviceName: device.name, error: errorMessage });
            }
        }

        if (failures.length > 0) {
            const summary = failures
                .map(failure => `${failure.deviceName || failure.deviceId}: ${failure.error}`)
                .join('; ');
            throw new Error(`Failed to configure ${failures.length} device(s) in group ${groupId}: ${summary}`);
        }

        logger.info('All devices in ConnectX Group configured successfully', {
            groupId: group.id,
            deviceCount: devices.length
        });
    }

    /**
     * Remove the ConnectX netplan configuration from a device.
     *
     * Deletes the ConnectX netplan file and applies netplan to remove the configuration.
     * If the configuration file does not exist, the device is treated as already unconfigured.
     *
     * @param device Device to unconfigure
     * @param password Sudo password used for file removal and netplan apply
     * @returns True if unconfigured (or already unconfigured), otherwise false
     */
    public async unconfigureConnectXNICsForDevice(device: Device, password: string): Promise<boolean> {
        logger.info('Unconfiguring ConnectX NICs for device', { device: device.name });

        let client: SSHClient | undefined;
        try {
            try {
                client = await createSSHConnection(device, { readyTimeout: 10000, timeout: 10000 });
            } catch (connectionError) {
                const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
                logger.error('SSH connection failed during ConnectX NIC unconfiguration', {
                    device: device.name,
                    error: errorMessage
                });
                return false;
            }

            const checkCommand = `sudo -S sh -c "if [ -f ${NETPLAN_CONNECTX_CONFIG_PATH} ]; then echo exists; else echo missing; fi"`;
            const checkResult = await executeCommandOnClient(
                client,
                checkCommand,
                {
                    operationName: 'Check netplan config',
                    timeoutSeconds: 10,
                    sudoPassword: password
                }
            );

            if (!checkResult.success) {
                logger.error('Failed to check netplan configuration file', {
                    device: device.name,
                    error: checkResult.stderr
                });
                return false;
            }

            if (checkResult.stdout.trim() === 'missing') {
                logger.info('Netplan configuration file not found; already unconfigured', {
                    device: device.name,
                    path: NETPLAN_CONNECTX_CONFIG_PATH
                });
                return true;
            }

            const removeCommand = `sudo -S rm -f ${NETPLAN_CONNECTX_CONFIG_PATH}`;
            const removeResult = await executeCommandOnClient(
                client,
                removeCommand,
                {
                    operationName: 'Remove netplan config',
                    timeoutSeconds: 10,
                    sudoPassword: password
                }
            );

            if (!removeResult.success) {
                logger.error('Failed to remove netplan configuration file', {
                    device: device.name,
                    error: removeResult.stderr
                });
                return false;
            }

            const applyCommand = 'sudo -S netplan apply';
            const applyResult = await executeCommandOnClient(
                client,
                applyCommand,
                {
                    operationName: 'Apply netplan config',
                    timeoutSeconds: 30,
                    sudoPassword: password
                }
            );

            if (!applyResult.success) {
                logger.error('Failed to apply netplan configuration after removal', {
                    device: device.name,
                    error: applyResult.stderr
                });
                return false;
            }

            logger.info('ConnectX NICs unconfigured successfully', { device: device.name });
            return true;
        } finally {
            if (client) {
                try {
                    client.end();
                } catch (err) {
                    logger.debug('Error closing SSH client for ConnectX NIC unconfiguration', {
                        device: device.name,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }
    }

    /**
     * Remove the ConnectX netplan configuration for every device in a group.
     *
     * Resolves all devices in the group, then invokes `unconfigureConnectXNICsForDevice()` sequentially.
     * If any device fails to unconfigure, an aggregated error is thrown after all attempts complete.
     *
     * @param groupId ID of the group whose devices should be unconfigured
     * @param password Sudo password used for file removal and netplan apply on each device
     * @throws Error if the group or any device is missing, or if any device fails to unconfigure
     */
    public async unconfigureConnectXNICsForGroup(groupId: string, password: string): Promise<void> {
        const group = this.config.store.get(groupId);
        if (!group) {
            throw new Error(`Group not found: ${groupId}`);
        }

        logger.info('Unconfiguring ConnectX NICs for devices in group', {
            groupId: group.id,
            deviceCount: group.deviceIds.length
        });

        const deviceResults = await Promise.all(
            group.deviceIds.map(deviceId => this.deviceService.getDevice(deviceId))
        );

        const missingDevices = group.deviceIds.filter((deviceId, index) => deviceResults[index] === null);
        if (missingDevices.length > 0) {
            throw new Error(`Devices not found in group ${groupId}: ${missingDevices.join(', ')}`);
        }

        const devices = deviceResults.filter((device): device is Device => device !== null);
        const failures: Array<{ deviceId: string; deviceName: string; error: string }> = [];

        for (const device of devices) {
            try {
                const success = await this.unconfigureConnectXNICsForDevice(device, password);
                if (!success) {
                    const errorMessage = 'Unconfiguration failed';
                    logger.error('Failed to unconfigure ConnectX NICs for device in group', {
                        groupId: group.id,
                        deviceId: device.id,
                        deviceName: device.name,
                        error: errorMessage
                    });
                    failures.push({ deviceId: device.id, deviceName: device.name, error: errorMessage });
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error('Failed to unconfigure ConnectX NICs for device in group', {
                    groupId: group.id,
                    deviceId: device.id,
                    deviceName: device.name,
                    error: errorMessage
                });
                failures.push({ deviceId: device.id, deviceName: device.name, error: errorMessage });
            }
        }

        if (failures.length > 0) {
            const summary = failures
                .map(failure => `${failure.deviceName || failure.deviceId}: ${failure.error}`)
                .join('; ');
            throw new Error(`Failed to unconfigure ${failures.length} device(s) in group ${groupId}: ${summary}`);
        }

        logger.info('All devices in ConnectX Group unconfigured successfully', {
            groupId: group.id,
            deviceCount: devices.length
        });
    }

    /**
     * Build netplan configuration content for ConnectX NICs.
     * Generates YAML configuration for link-local IPv4 addressing on all provided NICs.
     * 
     * @param nics Array of ConnectX NICs to configure
     * @returns Netplan YAML configuration as a string
     */
    private buildNetplanConfig(nics: ConnectXNIC[]): string {
        const lines: string[] = [
            'network:',
            '  version: 2',
            '  ethernets:'
        ];

        const linuxDeviceNamePattern = /^enp[a-zA-Z0-9_-]+$/;

        for (const nic of nics) {
            if (!linuxDeviceNamePattern.test(nic.linuxDeviceName)) {
                throw new Error(
                    `Invalid linuxDeviceName for netplan configuration: ${nic.linuxDeviceName}`
                );
            }
            lines.push(`    ${nic.linuxDeviceName}:`);
            lines.push('      link-local: [ ipv4 ]');
        }

        return lines.join('\n');
    }
}

/**
 * Singleton instance of ConnectXGroupService.
 */
export const connectxGroupService = new ConnectXGroupService(
    deviceService,
    {
        store: groupStore,
        telemetry: telemetryService
    }
);
