/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * SSH configuration utility for building SSH connection configurations.
 * Handles reading ~/.ssh/config and merging with device properties.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ConnectConfig } from 'ssh2';
import * as SSHConfig from 'ssh-config';
import { Device } from '../types/devices';
import { logger } from './logger';

export interface SSHConfigOptions {
    readyTimeout?: number;
    timeout?: number;
}

/**
 * Get SSH configuration for a device.
 * Reads from ~/.ssh/config and merges with device properties.
 * 
 * @param device The device to get SSH config for
 * @param options Optional timeout configuration
 * @returns SSH connection configuration
 */
export function getSSHConfig(device: Device, options?: SSHConfigOptions): ConnectConfig {
    const config: ConnectConfig = {
        host: device.host,
        port: device.port || 22,
        username: device.username,
        readyTimeout: options?.readyTimeout,
        timeout: options?.timeout,
    };

    const hostConfig = loadSSHConfigForHost(device.host);
    
    if (hostConfig) {
        applyHostConfigToConnection(config, hostConfig);
    }

    ensureAuthenticationMethod(config);

    return config;
}

/**
 * Load SSH config file and get host-specific configuration
 */
function loadSSHConfigForHost(host: string): any {
    const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');

    if (!fs.existsSync(sshConfigPath)) {
        return null;
    }

    try {
        const sshConfigContent = fs.readFileSync(sshConfigPath, 'utf-8');
        const parsedConfig = SSHConfig.parse(sshConfigContent);
        const hostConfig = parsedConfig.compute(host);

        if (hostConfig) {
            logger.debug('Found SSH config for host', { host });
        }

        return hostConfig;
    } catch (error) {
        logger.warn('Failed to parse SSH config', {
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
}

/**
 * Apply SSH config settings to connection config
 */
function applyHostConfigToConnection(config: ConnectConfig, hostConfig: any): void {
    applyHostName(config, hostConfig);
    applyPort(config, hostConfig);
    applyUsername(config, hostConfig);
    applyIdentityFiles(config, hostConfig);
    applyIdentitiesOnly(config, hostConfig);
}

/**
 * Apply HostName from SSH config
 */
function applyHostName(config: ConnectConfig, hostConfig: any): void {
    if (hostConfig.HostName) {
        config.host = typeof hostConfig.HostName === 'string' 
            ? hostConfig.HostName 
            : hostConfig.HostName[0];
    }
}

/**
 * Apply Port from SSH config
 */
function applyPort(config: ConnectConfig, hostConfig: any): void {
    if (hostConfig.Port) {
        config.port = typeof hostConfig.Port === 'string'
            ? Number.parseInt(hostConfig.Port)
            : Number.parseInt(hostConfig.Port[0]);
    }
}

/**
 * Apply User from SSH config
 */
function applyUsername(config: ConnectConfig, hostConfig: any): void {
    if (hostConfig.User) {
        config.username = typeof hostConfig.User === 'string'
            ? hostConfig.User
            : hostConfig.User[0];
    }
}

/**
 * Apply IdentityFile from SSH config
 */
function applyIdentityFiles(config: ConnectConfig, hostConfig: any): void {
    if (!hostConfig.IdentityFile) {
        return;
    }

    const identityFiles = Array.isArray(hostConfig.IdentityFile)
        ? hostConfig.IdentityFile
        : [hostConfig.IdentityFile];

    for (const keyPath of identityFiles) {
        const privateKey = readPrivateKey(keyPath);
        if (privateKey) {
            config.privateKey = privateKey;
            logger.debug('Using identity file from SSH config', { path: keyPath });
            break;
        }
    }
}

/**
 * Apply IdentitiesOnly setting from SSH config
 */
function applyIdentitiesOnly(config: ConnectConfig, hostConfig: any): void {
    if (!hostConfig.IdentitiesOnly) {
        return;
    }

    let identitiesOnly = '';
    if (typeof hostConfig.IdentitiesOnly === 'string') {
        identitiesOnly = hostConfig.IdentitiesOnly;
    } else if (Array.isArray(hostConfig.IdentitiesOnly) && hostConfig.IdentitiesOnly.length > 0) {
        identitiesOnly = hostConfig.IdentitiesOnly[0];
    }

    if (identitiesOnly.toLowerCase() === 'yes') {
        delete config.agent;
    }
}

/**
 * Ensure authentication method is configured
 */
function ensureAuthenticationMethod(config: ConnectConfig): void {
    if (config.privateKey) {
        return;
    }

    tryCommonKeyLocations(config);
}

/**
 * Try common SSH key locations
 */
function tryCommonKeyLocations(config: ConnectConfig): void {
    const commonKeys = [
        path.join(os.homedir(), '.ssh', 'id_ed25519'),
        path.join(os.homedir(), '.ssh', 'id_rsa'),
        path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ];

    for (const keyPath of commonKeys) {
        const privateKey = readPrivateKey(keyPath);
        if (privateKey) {
            config.privateKey = privateKey;
            logger.debug('Using default identity file', { path: keyPath });
            break;
        }
    }
}

/**
 * Read SSH private key from file.
 * 
 * @param keyPath Path to the private key file
 * @returns Buffer containing the private key, or undefined if not found
 */
function readPrivateKey(keyPath: string): Buffer | undefined {
    try {
        const expandedPath = keyPath.replace(/^~/, os.homedir());
        if (fs.existsSync(expandedPath)) {
            return fs.readFileSync(expandedPath);
        }
    } catch (error) {
        logger.warn(`Failed to read private key from ${keyPath}`, {
            error: error instanceof Error ? error.message : String(error)
        });
    }
    return undefined;
}
