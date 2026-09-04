/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device model types for the Z Toolkit extension.
 * Defines the structure and state of remote ZGX devices.
 */

/**
 * Enumeration of supported device types.
 *
 * Lifecycle semantics:
 * - `Pending`  — device created, fingerprint detection not yet run
 * - `Unknown`  — detection was attempted but failed (SSH error, file missing, etc.)
 * - `Other`    — detection ran cleanly but no known signature matched
 * - known types — detection succeeded and matched a known product signature
 */
export enum DeviceType {
    Pending = 'pending',
    Unknown = 'unknown',
    ZGXFury = 'zgx_fury',
    ZGXNano = 'zgx_nano',
    Z8 = 'z8',
    Z6 = 'z6',
    Z4 = 'z4',
    Z2 = 'z2',
    Other = 'other'
}

/**
 * A user-selectable device type paired with its human-readable label.
 */
export interface DeviceTypeOption {
    value: DeviceType;
    label: string;
}

/**
 * Ordered list of device types that should be presented to the user in pickers
 * (e.g. dropdowns). Excludes internal-only lifecycle states (Pending, Unknown).
 *
 * This is the single source of truth for device type labels — reuse
 * `getDeviceTypeOptions()` / `getDeviceTypeLabel()` instead of duplicating
 * value/label pairs in views or controllers.
 */
const SELECTABLE_DEVICE_TYPES: DeviceTypeOption[] = [
    { value: DeviceType.ZGXFury, label: 'ZGX Fury' },
    { value: DeviceType.ZGXNano, label: 'ZGX Nano' },
    { value: DeviceType.Z8, label: 'Z8' },
    { value: DeviceType.Z6, label: 'Z6' },
    { value: DeviceType.Z4, label: 'Z4' },
    { value: DeviceType.Z2, label: 'Z2' },
    { value: DeviceType.Other, label: 'Other' }
];

/**
 * Returns the list of user-selectable device types (value/label pairs) for use in
 * dropdowns and other pickers across views.
 */
export function getDeviceTypeOptions(): DeviceTypeOption[] {
    return SELECTABLE_DEVICE_TYPES;
}

/**
 * Maps a DeviceType enum value to its human-readable display label.
 * Returns null for types that are not user-visible (Pending, Unknown, undefined).
 */
export function getDeviceTypeLabel(deviceType?: DeviceType): string | null {
    return SELECTABLE_DEVICE_TYPES.find(option => option.value === deviceType)?.label ?? null;
}

/**
 * Device types that currently support local model inferencing (e.g. ZRT). These device
 * types get inference-oriented tooling featured prominently in the app selection screen.
 * Note: ZRT is currently only supported on ARM-based devices (e.g. Fury and Nano).
 */
const INFERENCE_DEVICE_TYPES = new Set<DeviceType>([
    DeviceType.ZGXFury,
    DeviceType.ZGXNano
]);

/**
 * Returns true if the given device type supports local model inferencing (e.g. ZRT). Devices that
 * do not currently support it or types not yet determined (e.g. x86 Z8/Z4/Z2) will return false.
 */
export function isInferenceDeviceType(deviceType?: DeviceType): boolean {
    return !!deviceType && INFERENCE_DEVICE_TYPES.has(deviceType);
}

/**
 * Collected hardware fingerprint data for a device.
 *
 * Keep this object extensible so additional fields (GPU, CPU, etc.) can be
 * added without changing higher-level model shape.
 */
export interface DeviceFingerprint {
    /** Device type inferred from known fingerprint signatures */
    deviceType?: DeviceType;
}

/**
 * SSH key setup state for a device.
 */
export interface KeySetup {
    /** Whether SSH key has been generated */
    keyGenerated: boolean;
    /** Whether public key has been copied to remote host */
    keyCopied: boolean;
    /** Whether SSH connection has been tested */
    connectionTested: boolean;
}

/**
 * Application information for a device.
 */
export interface DeviceApp {
    /** Unique identifier for the application */
    id: string;
    /** Display name of the application */
    name: string;
    /** Application description */
    description?: string;
    /** Whether the application is installed */
    installed: boolean;
}

/**
 * Configuration for creating a new device.
 */
export interface DeviceConfig {
    /** Display name for the device */
    name: string;
    /** Hostname or IP address */
    host: string;
    /** SSH username */
    username: string;
    /** SSH port number */
    port: number;
    /** Whether to use SSH key authentication */
    useKeyAuth: boolean;
    /** Optional hardware fingerprint information */
    fingerprint?: DeviceFingerprint;
}

/**
 * Complete device model representing a remote ZGX device.
 */
export interface Device {
    /** Unique identifier for the device */
    id: string;
    /** Display name for the device */
    name: string;
    /** Hostname or IP address */
    host: string;
    /** SSH username */
    username: string;
    /** SSH port number */
    port: number;
    /** Whether initial setup is complete */
    isSetup: boolean;
    /** Whether to use SSH key authentication */
    useKeyAuth: boolean;
    /** SSH key setup state */
    keySetup: KeySetup;
    /** DNS-SD instance name (MAC address hash used for service discovery) */
    dnsInstanceName?: string;
    /** Whether app setup is complete */
    appSetupComplete?: boolean;
    /** Last connection method used (false = current window, true = new window) */
    lastConnectionMethod?: boolean;
    /** ISO timestamp when the device was created */
    createdAt: string;
    /** ISO timestamp when the device was last updated */
    updatedAt?: string;
    /** Optional additional metadata */
    metadata?: Record<string, unknown>;
    /** Optional hardware fingerprint information */
    fingerprint?: DeviceFingerprint;
}

/**
 * Result of a device discovery operation.
 */
export interface DiscoveredDevice {
    /** DNS-SD service name */
    name: string;
    /** Hostname of the device */
    hostname: string;
    /** Array of IP addresses for the device */
    addresses: string[];
    /** Network protocol used (TCP/UDP) */
    protocol: string;
    /** SSH port number */
    port: number;
    /** TXT records from mDNS service discovery */
    txtRecords?: Record<string, string>;
    /** Additional discovery metadata */
    metadata?: Record<string, unknown>;
}
