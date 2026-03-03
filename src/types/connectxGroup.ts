/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * ConnectX Group types for managing device groups.
 * Groups allow multiple devices to be organized together for coordinated operations.
 */

import { Device } from './devices';

/**
 * Represents a group of connected devices.
 */
export interface ConnectXGroup {
    /** Unique identifier for the group */
    id: string;
    /** Array of device IDs in this group */
    deviceIds: string[];
    /** Timestamp when group was created */
    createdAt: string;
    /** Timestamp when group was last updated */
    updatedAt: string;
    /** Optional metadata for the group */
    metadata?: Record<string, any>;
}

/**
 * Configuration for creating a new ConnectX Group.
 */
export interface ConnectXGroupConfig {
    /** Initial device IDs to add to the group (must be at least 2) */
    deviceIds: string[];
    /** Optional metadata */
    metadata?: Record<string, any>;
}

/**
 * Detailed group information including device details.
 */
export interface ConnectXGroupInfo {
    /** The ConnectX group */
    group: ConnectXGroup;
    /** Full device objects for devices in the group */
    devices: Device[];
}

/**
 * Result of a group operation.
 */
export interface ConnectXGroupOperationResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** The affected group (if applicable) */
    group?: ConnectXGroup;
    /** Error message if operation failed */
    error?: string;
    /** Error message if a non-fatal issue occurred during the process.
     * success will likely still be set to true if this is present, but it indicates that there were some issues that should be noted.
     */
    nonFatalError?: string;
    /** Additional details about the operation */
    message?: string;
}

/** Description of a ConnectX Network Interface Card (NIC) */
export interface ConnectXNIC {
    /** The Linux device name for this network interface */
    linuxDeviceName: string;
    /** The IPv4 address assigned to this network interface */
    ipv4Address: string;
}
