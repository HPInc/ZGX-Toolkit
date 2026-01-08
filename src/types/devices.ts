/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device model types for the ZGX Toolkit extension.
 * Defines the structure and state of remote ZGX devices.
 */

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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
}
