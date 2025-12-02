/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Device service for ZGX Toolkit extension.
 * Provides business logic for device CRUD operations, validation, and discovery.
 * 
 * This is a clean, modern implementation built from scratch for the rewrite.
 */

import * as net from 'net';
import { Device, DeviceConfig } from '../types/devices';
import { deviceStore, DeviceStore } from '../store/deviceStore';
import { logger } from '../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../types/telemetry';
import { telemetryService } from './telemetryService';

/**
 * Configuration for the DeviceService.
 */
export interface DeviceServiceConfig {
  /** The device store instance to use */
  store: DeviceStore;
  telemetry: ITelemetryService;
}

/**
 * Service for managing device operations.
 * Handles creation, updates, deletion, and discovery of ZGX devices.
 */
export class DeviceService {
  private config: DeviceServiceConfig;

  constructor(config: DeviceServiceConfig) {
    this.config = config;
  }

  /**
   * Create a new device from configuration.
   * Validates the configuration, creates the device object, and saves it to the store.
   * 
   * @param deviceConfig Configuration for the new device
   * @returns Promise resolving to the created device
   * @throws Error if configuration is invalid
   */
  public async createDevice(deviceConfig: DeviceConfig): Promise<Device> {
    logger.info('Creating device', { name: deviceConfig.name, host: deviceConfig.host });

    try {
      // Validate configuration
      this.validateDeviceConfig(deviceConfig);

      // Create device with full data
      const device: Device = {
        id: this.generateId(),
        name: deviceConfig.name,
        host: deviceConfig.host,
        username: deviceConfig.username,
        port: deviceConfig.port,
        //status: 'idle',
        isSetup: false,
        useKeyAuth: deviceConfig.useKeyAuth,
        keySetup: {
          keyGenerated: false,
          keyCopied: false,
          connectionTested: false,
        },
        createdAt: new Date().toISOString(),
      };

      // Save to store
      this.config.store.set(device.id, device);

      logger.debug('device created successfully', { id: device.id, name: device.name });
      this.config.telemetry.trackEvent({
        eventType: TelemetryEventType.Device,
        action: 'create',
      });

      return device;
    } catch (error) {
      logger.error('Failed to create device', { error, config: deviceConfig });
      this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.create' });
      throw error;
    }
  }

  /**
   * Update an existing device with partial data.
   * 
   * @param id device identifier
   * @param updates Partial device data to merge
   * @returns Promise resolving when update is complete
   * @throws Error if device is not found
   */
  public async updateDevice(id: string, updates: Partial<Device>): Promise<void> {
    logger.info('Updating device', { id, updates: Object.keys(updates) });

    try {
      const device = this.config.store.get(id);
      
      if (!device) {
        const error = new Error(`device not found: ${id}`);
        logger.error('device not found for update', { id });
        throw error;
      }

      // Update in store
      const success = this.config.store.update(id, updates);
      
      if (!success) {
        throw new Error(`Failed to update device: ${id}`);
      }

      logger.debug('device updated successfully', { id, updates: Object.keys(updates) });
      this.config.telemetry.trackEvent({
        eventType: TelemetryEventType.Device,
        action: 'update'
      });
    } catch (error) {
      logger.error('Failed to update device', { error, id });
      this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.update' });
      throw error;
    }
  }

  /**
   * Delete a device from the system.
   * 
   * @param id device identifier
   * @returns Promise resolving when deletion is complete
   * @throws Error if device is not found
   */
  public async deleteDevice(id: string): Promise<void> {
    logger.info('Deleting device', { id });

    try {
      const device = this.config.store.get(id);
      
      if (!device) {
        const error = new Error(`device not found: ${id}`);
        logger.error('device not found for deletion', { id });
        throw error;
      }

      // Delete from store
      const success = this.config.store.delete(id);
      
      if (!success) {
        throw new Error(`Failed to delete device: ${id}`);
      }

      logger.debug('device deleted successfully', { id, name: device.name });
      this.config.telemetry.trackEvent({
        eventType: TelemetryEventType.Device,
        action: 'delete'
      });
    } catch (error) {
      logger.error('Failed to delete device', { error, id });
      this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.delete' });
      throw error;
    }
  }

  /**
   * Get a device by ID.
   * 
   * @param id device identifier
   * @returns The device or undefined if not found
   */
  public getDevice(id: string): Device | undefined {
    return this.config.store.get(id);
  }

  /**
   * Validate device configuration before creation.
   * 
   * @param config device configuration to validate
   * @throws Error if configuration is invalid
   */
  private validateDeviceConfig(config: DeviceConfig): void {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('invalid device name');
    }

    if (!config.host || this.validateHost(config.host) === false) {
      errors.push('invalid device host');
    }

    if (!config.username || this.validateUsername(config.username) === false) {
      errors.push('invalid username');
    }

    if (!config.port || this.validatePort(config.port) === false) {
      errors.push('invalid port number (must be between 1 and 65535)');
    }

    if (errors.length > 0) {
      const errorMessage = `Invalid device configuration: ${errors.join(', ')}`;
      logger.warn('device configuration validation failed', { errors });
      throw new Error(errorMessage);
    }

    // Check for duplicate names
    const existing = this.config.store.getAll().find(d => d.name === config.name);
    if (existing) {
      const error = `A device with the name "${config.name}" already exists`;
      logger.warn('Duplicate device name', { name: config.name });
      throw new Error(error);
    }
  }

  /**
   * Generate a unique ID for a new device.
   * Uses timestamp and random string for uniqueness.
   * 
   * @returns Unique device identifier
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `device-${timestamp}-${random}`;
  }

  /**
   * Connect to a device via Remote-SSH.
   * device should already be set up before calling this method.
   * If device is not set up, throws a DeviceNeedsSetupError.
   * 
   * @param id device identifier
   * @param newWindow Whether to open in a new window (optional)
   * @returns Promise resolving when connection is initiated
   * @throws DeviceNeedsSetupError if device requires setup
   * @throws Error if device is not found
   */
  public async connectToDevice(id: string, newWindow?: boolean): Promise<void> {
    logger.info('Attempting to connect to device', { id, newWindow });

    try {
      const device = this.config.store.get(id);
      
      if (!device) {
        const error = new Error(`device not found: ${id}`);
        logger.error('device not found for connection', { id });
        throw error;
      }

      // Check if device needs setup
      // Note: The UI should prevent calling this for non-setup devices,
      // but we still check here as a safety measure
      if (!device.isSetup) {
        logger.warn('Attempted to connect to device that requires setup', { 
          id, 
          name: device.name 
        });
        
        const error = new DeviceNeedsSetupError(
          `device "${device.name}" requires SSH setup before connecting`,
          device
        );
        throw error;
      }

      // device is setup, connect via ConnectionService
      logger.debug('device is setup, initiating connection', { id, name: device.name });
      
      // Import ConnectionService here to avoid circular dependencies
      const { connectionService } = await import('./connectionService');
      
      // Update device preference if specified
      if (newWindow !== undefined) {
        await this.updateDevice(id, { lastConnectionMethod: newWindow });
      }
      
      // Connect via Remote-SSH
      await connectionService.connectViaRemoteSSH(device, newWindow);
      
      logger.info('Connection initiated successfully', { id, name: device.name });
      this.config.telemetry.trackEvent({
        eventType: TelemetryEventType.Device,
        action: 'connect',
        properties: {
          newWindow: String(newWindow),
        }
      });
      
    } catch (error) {
      // Re-throw DeviceNeedsSetupError as-is so views can handle it
      if (error instanceof DeviceNeedsSetupError) {
        throw error;
      }
      
      logger.error('Failed to connect to device', { error, id });
      this.config.telemetry.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: 'device.connect' });
      throw error;
    }
  }

  /**
     * Validates username to prevent SSH injection attacks.
     * Allows alphanumeric characters, dash, underscore, period, backslash, and @.
     * Disallows spaces and leading "..".
     */
    private validateUsername(username: string): boolean {
        if (!username || typeof username !== 'string') {
            return false;
        }
        
        // Disallow spaces
        if (/\s/.test(username)) {
            return false;
        }
        
        // Disallow leading ".."
        if (username.startsWith('..')) {
            return false;
        }
        
        // Allow alphanumeric, dash, underscore, period, backslash, and @
        // Note: @ is valid in usernames but will be escaped when used in SSH commands
        return /^[a-zA-Z0-9._\-\\@]+$/.test(username);
    }

    /**
     * Validates hostname/IP address to prevent injection attacks.
     * Allows valid hostnames, IPv4, and IPv6 addresses.
     */
    private validateHost(host: string): boolean {
        if (!host || typeof host !== 'string') {
            return false;
        }
        
        // Remove leading/trailing whitespace
        host = host.trim();
        
        // Check for empty or too long hostname
        if (host.length === 0 || host.length > 253) {
            return false;
        }
        
        // Check if it's a valid IPv4 address using Node.js built-in function
        if (net.isIPv4(host)) {
            return true;
        }
        
        // Check if it's a valid IPv6 address using Node.js built-in function
        if (net.isIPv6(host)) {
            return true;
        }
        
        // Valid hostname pattern (RFC 1123)
        const hostnameRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        
        // Check if it matches valid hostname pattern
        if (hostnameRegex.test(host)) {
            return true;
        }
        
        return false;
    }

    /**
     * Validates SSH port number.
     */
    private validatePort(port: number): boolean {
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }
}

/**
 * Custom error thrown when a device needs setup before connecting.
 * Views can catch this error and navigate to the setup flow.
 */
export class DeviceNeedsSetupError extends Error {
  public readonly device: Device;
  public readonly requiresSetup = true;

  constructor(message: string, device: Device) {
    super(message);
    this.name = 'DeviceNeedsSetupError';
    this.device = device;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeviceNeedsSetupError);
    }
  }
}

/**
 * Singleton device service instance for use throughout the extension.
 * Initialized with the global device store.
 */
export const deviceService = new DeviceService({
  store: deviceStore,
  telemetry: telemetryService
});
