/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Connection service for SSH operations with remote devices.
 * Handles SSH key generation, connectivity testing, and VS Code Remote-SSH integration.
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Device } from '../types/devices';
import { logger } from '../utils/logger';
import { DnsServiceRegistrationResult, dnsServiceRegistration } from './dnsRegistrationService';

const execAsync = promisify(exec);

/**
 * Platform-specific information for command generation.
 */
export interface PlatformInfo {
    shell: string;
    type: 'cmd' | 'powershell' | 'bash' | 'zsh' | 'fish' | 'other';
}

/**
 * SSH key information.
 */
export interface SSHKeyInfo {
    keyPath: string;
    publicKeyPath: string;
    publicKey: string;
}

/**
 * Manual SSH commands for different platforms.
 */
export interface ManualSSHCommands {
    windows: { keyGen: string; copy: string };
    linux: { keyGen: string; copy: string };
    mac: { keyGen: string; copy: string };
    testCommand: string;
}

/**
 * Service for handling SSH connections and key management.
 */
export class ConnectionService {
    /**
     * Generate SSH key pair if it doesn't exist.
     * Uses ed25519 for modern security.
     * 
     * @returns SSH key information or null if generation failed
     */
    public async generateSSHKey(): Promise<SSHKeyInfo | null> {
        logger.info('Generating SSH key pair');

        try {
            const sshDir = path.join(os.homedir(), '.ssh');
            const keyName = 'id_ed25519';
            const keyPath = path.join(sshDir, keyName);
            const publicKeyPath = `${keyPath}.pub`;

            // Check if key already exists
            const keyExists = fs.existsSync(keyPath);

            if (!keyExists) {
                logger.debug('SSH key does not exist, generating new key');

                // Ensure .ssh directory exists with proper permissions
                if (!fs.existsSync(sshDir)) {
                    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
                    logger.debug('.ssh directory created');
                }

                // Generate ed25519 SSH key pair using spawn with array parameters
                const keygenArgs = [
                    '-t', 'ed25519',
                    '-f', keyPath,
                    '-N', '',
                    '-C', 'zgx-toolkit-vscode-extension'
                ];

                logger.debug('Executing ssh-keygen command');

                await new Promise<void>((resolve, reject) => {
                    const keygenProcess = spawn('ssh-keygen', keygenArgs);

                    let stderr = '';

                    keygenProcess.stderr?.on('data', (data) => {
                        stderr += data.toString();
                    });

                    keygenProcess.on('close', (code) => {
                        if (code === 0) {
                            logger.info('SSH key generated successfully');
                            resolve();
                        } else {
                            logger.error('SSH key generation failed', { exitCode: code, stderr });
                            reject(new Error(`ssh-keygen failed with exit code ${code}: ${stderr}`));
                        }
                    });

                    keygenProcess.on('error', (err) => {
                        logger.error('SSH key generation process error', { error: err.message });
                        reject(err);
                    });
                });
            } else {
                logger.debug('SSH key already exists, using existing key');
            }

            // Read the public key
            const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();

            return {
                keyPath,
                publicKeyPath,
                publicKey,
            };
        } catch (error) {
            logger.error('Failed to generate SSH key', { error });
            vscode.window.showErrorMessage(
                `Failed to generate SSH key: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return null;
        }
    }

    /**
     * Check if ed25519 SSH key pair exists.
     */
    public hasIDED25519Key(): boolean {
        const sshDir = path.join(os.homedir(), '.ssh');
        const keyPath = path.join(sshDir, 'id_ed25519');
        const publicKeyPath = `${keyPath}.pub`;
        return fs.existsSync(keyPath) && fs.existsSync(publicKeyPath);
    }

    /**
     * Get the platform-specific shell information.
     */
    public getPlatformInfo(): PlatformInfo {
        const config = vscode.workspace.getConfiguration('terminal.integrated');
        const isWindows = os.platform() === 'win32';
        const isMac = os.platform() === 'darwin';

        let shellPath: string | undefined;

        if (isWindows) {
            shellPath = config.get('shell.windows');
        } else if (isMac) {
           shellPath = config.get('shell.osx');
        } else {
            shellPath = config.get('shell.linux');
        }

        // Fallback to system defaults
        if (!shellPath) {
            if (isWindows) {
                shellPath = process.env.COMSPEC || 'cmd.exe';
            } else {
                shellPath = process.env.SHELL || '/bin/bash';
            }
        }

        const shellName = path.basename(shellPath).toLowerCase();

        // Determine shell type
        let shellType: 'cmd' | 'powershell' | 'bash' | 'zsh' | 'fish' | 'other';

        if (shellName.includes('cmd') || shellName.includes('command')) {
            shellType = 'cmd';
        } else if (shellName.includes('powershell') || shellName.includes('pwsh')) {
            shellType = 'powershell';
        } else if (shellName.includes('bash')) {
            shellType = 'bash';
        } else if (shellName.includes('zsh')) {
            shellType = 'zsh';
        } else if (shellName.includes('fish')) {
            shellType = 'fish';
        } else {
            shellType = 'other';
        }

        logger.debug('Detected platform shell', { shellPath, shellType });

        return { shell: shellPath, type: shellType };
    }

    /**
     * Generate platform-specific SSH key copy command.
     * 
     * @param device The device to copy the key to
     * @returns The command string to execute
     */
    public generateSSHKeyCopyCommand(device: Device): string {
        const platformInfo = this.getPlatformInfo();
        const keyName = 'id_ed25519';
        const sshDir = path.join(os.homedir(), '.ssh');
        const publicKeyPath = path.join(sshDir, `${keyName}.pub`);

        const sshTarget = device.port !== 22
            ? `ssh -p ${device.port} ${device.username}@${device.host}`
            : `ssh ${device.username}@${device.host}`;

        const remoteCommands = 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys';

        switch (platformInfo.type) {
            case 'cmd':
                return `type "${publicKeyPath}" | ${sshTarget} "${remoteCommands}"`;

            case 'powershell':
                return `Get-Content "${publicKeyPath}" -Raw | ${sshTarget} "${remoteCommands}"`;

            case 'bash':
            case 'zsh':
            case 'other':
            default:
                return `cat "${publicKeyPath}" | ${sshTarget} "${remoteCommands}"`;
        }
    }

    /**
     * Test SSH key connectivity to a device.
     * Uses BatchMode to avoid password prompts.
     * 
     * @param device The device to test
     * @param timeoutMs Timeout in milliseconds (default 15000)
     * @returns True if connection successful, false otherwise
     */
    public async testSSHKeyConnectivity(device: Device, timeoutMs: number = 15000): Promise<boolean> {
        logger.info('Testing SSH key connectivity', {
            device: device.name,
            host: device.host,
            port: device.port,
        });

        // Build SSH args array
        const sshArgs = [
            '-T',
            '-o', 'BatchMode=yes',
            '-o', 'ConnectTimeout=10',
            '-o', 'ServerAliveInterval=5',
            '-o', 'ServerAliveCountMax=2',
        ];

        if (device.port !== 22) {
            sshArgs.push('-p', device.port.toString());
        }

        sshArgs.push(`${device.username}@${device.host}`, 'exit');

        logger.debug('SSH test command', { args: sshArgs });

        return new Promise<boolean>((resolve) => {
            const timeoutHandle = setTimeout(() => {
                logger.warn('SSH connectivity test timed out', {
                    device: device.name,
                    timeout: timeoutMs,
                });
                resolve(false);
            }, timeoutMs);

            const sshProcess = spawn('ssh', sshArgs);

            sshProcess.on('close', (code) => {
                clearTimeout(timeoutHandle);
                const success = code === 0;

                logger.info('SSH connectivity test completed', {
                    device: device.name,
                    success,
                    exitCode: code,
                });

                resolve(success);
            });

            sshProcess.on('error', (err) => {
                clearTimeout(timeoutHandle);
                logger.info('SSH connectivity test error', {
                    device: device.name,
                    success: false,
                    error: err.message,
                });
                resolve(false);
            });
        });
    }

    /**
     * Registers the DNS hpzgx service with Avahi on the remote ZGX device.
     * This is called after successful SSH connection test during device setup.
     * 
     * @param device The device to register the service on
     * @returns Promise resolving to registration result
     */
    public async registerDNSServiceWithAvahi(device: Device, sudoPassword: string): Promise<DnsServiceRegistrationResult> {
        logger.info('Registering mDNS hpzgx service with the Avahi daemon', { device: device.name });

        try {
            return await dnsServiceRegistration.registerDNSService(device, sudoPassword);
        } catch (error) {
            logger.error('Failed to register mDNS hpzgx service with the Avahi daemon', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });
            
            return {
                success: false,
                alreadyRegistered: false,
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Check if DNS service file already exists on device
     * 
     * @param device The device to check
     * @returns Promise resolving to file existence result
     */
    public async checkDNSServiceFileExists(device: Device): Promise<{ exists: boolean; error?: string }> {
        logger.info('Checking if mDNS service file exists', { device: device.name });

        try {
            return await dnsServiceRegistration.checkServiceFileExists(device);
        } catch (error) {
            logger.error('Failed to check mDNS service file existence', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });
            
            return {
                exists: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Validate password for DNS registration
     * 
     * @param device The device to validate password for
     * @param password The password to validate
     * @returns Promise resolving to validation result
     */
    public async validatePasswordForDNS(device: Device, password: string): Promise<{ valid: boolean; isConnectionError: boolean; error?: string }> {
        logger.info('Validating password for mDNS registration', { device: device.name });

        try {
            return await dnsServiceRegistration.validatePassword(device, password);
        } catch (error) {
            logger.error('Failed to validate password for mDNS', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });
            
            return {
                valid: false,
                isConnectionError: true,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async ensureSSHConfigEntry(alias: string, device: Device): Promise<void> {
        try {
            const sshDir = path.join(os.homedir(), '.ssh');
            const cfgPath = path.join(sshDir, 'config');
            if (!fs.existsSync(sshDir)) {
                fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
            }

            const existing = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : '';
            const hostRegex = new RegExp(`^Host\\s+${alias}(\\s|$)`, 'm');

            if (hostRegex.test(existing)) {
                logger.trace(`SSH config alias ${alias} already present; skipping append.`);
                return;
            }

            const block = [
                `Host ${alias}`,
                `  HostName ${device.host}`,
                `  User ${device.username}`,
                `  Port ${device.port}`,
                `  StrictHostKeyChecking ask`,
                ''
            ].join('\n');

            const prependNewLine = existing.length > 0 && !/\n$/.test(existing);
            const updated = (prependNewLine ? existing + '\n' : existing) + block;
            fs.writeFileSync(cfgPath, updated, { encoding: 'utf8', mode: 0o600 });
            logger.info(`Appended SSH config alias ${alias}`);
        } catch (e: any) {
            logger.error(`Failed to append ssh config alias ${alias}: ${e.message || e}`);
        }
    }

    /**
     * Open an SSH connection using VS Code's Remote-SSH extension.
     * 
     * @param device The device to connect to
     * @param forceNewWindow Whether to force opening in a new window
     * @returns Promise that resolves when connection is initiated
     */
    public async connectViaRemoteSSH(device: Device, forceNewWindow?: boolean): Promise<void> {
        logger.info('Connecting via Remote-SSH', {
            device: device.name,
            host: device.host,
            forceNewWindow,
        });

        try {
            // Check if Remote-SSH extension is installed
            const remoteSSHExtension = vscode.extensions.getExtension('ms-vscode-remote.remote-ssh');

            if (!remoteSSHExtension) {
                logger.warn('Remote-SSH extension not found');

                const install = await vscode.window.showWarningMessage(
                    'The Remote-SSH extension is required to connect to remote devices. Would you like to install it?',
                    'Install',
                    'Cancel'
                );

                if (install === 'Install') {
                    logger.debug('User chose to install Remote-SSH extension');
                    await vscode.commands.executeCommand(
                        'workbench.extensions.search',
                        '@id:ms-vscode-remote.remote-ssh'
                    );
                }
                return;
            }

            // Ensure the extension is activated
            if (!remoteSSHExtension.isActive) {
                logger.debug('Activating Remote-SSH extension');
                await remoteSSHExtension.activate();
            }

            // Build SSH connection string
            const sshTarget = `${device.username}@${device.host}`;
            logger.debug('SSH target', { target: sshTarget, port: device.port });

            // Show progress message
            vscode.window.showInformationMessage(`Connecting to ${device.name}...`);

            let connectLabel = sshTarget;

            if (device.port !== 22) {
                // Derive a stable alias
                const filteredHost = device.host.replace(/[^a-zA-Z0-9_.-]/g, '');
                const alias = `zgx-${filteredHost}-${device.port}`;
                connectLabel = alias;
                await this.ensureSSHConfigEntry(alias, device);
            }

            // Use Remote Explorer's connection method
            const remoteUri = `vscode-remote://ssh-remote+${connectLabel}/home/${device.username}`;
            logger.debug('Opening remote folder', { uri: remoteUri });

            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.parse(remoteUri),
                { forceNewWindow: forceNewWindow ?? false }
            );

            logger.info('Connection initiated successfully', { device: device.name });
            vscode.window.showInformationMessage(`Successfully connected to ${device.name}!`);
        } catch (error) {
            logger.error('Failed to connect via Remote-SSH', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name,
            });

            // If connection fails, help user add to SSH config
            const addToConfig = await vscode.window.showErrorMessage(
                `Could not connect to ${device.name}. The device might not be in your SSH config. Would you like to add it?`,
                'Add to SSH Config',
                'Try Manual Connection',
                'Cancel'
            );

            if (addToConfig === 'Add to SSH Config') {
                logger.debug('User chose to add to SSH config');
                await vscode.commands.executeCommand('remote-ssh.addNewSshHost');

                const sshCommand = device.port !== 22
                    ? `ssh ${device.username}@${device.host} -p ${device.port}`
                    : `ssh ${device.username}@${device.host}`;

                await vscode.window.showInformationMessage(
                    `Please add this SSH host: ${sshCommand}`,
                    { modal: false }
                );
            } else if (addToConfig === 'Try Manual Connection') {
                logger.debug('User chose to try manual connection');

                const sshCommand = device.port !== 22
                    ? `ssh ${device.username}@${device.host} -p ${device.port}`
                    : `ssh ${device.username}@${device.host}`;

                await vscode.window.showInformationMessage(
                    `Manual SSH connection command:\n${sshCommand}\n\nAfter successful manual connection, try connecting again through this extension.`,
                    { modal: true }
                );
            }
        }
    }

    /**
     * Open a terminal and execute an SSH key copy command.
     * Returns the terminal for the user to enter their password.
     * 
     * @param device The device to copy the key to
     * @returns The VS Code terminal instance
     */
    public async openTerminalForKeyCopy(device: Device): Promise<vscode.Terminal> {
        logger.info('Opening terminal for SSH key copy', { device: device.name });

        const copyCommand = this.generateSSHKeyCopyCommand(device);
        logger.debug('SSH key copy command generated', {
            commandPreview: copyCommand.substring(0, 50) + '...',
        });

        const terminal = vscode.window.createTerminal({
            name: `SSH Auto Setup - ${device.name}`,
            hideFromUser: false,
        });

        terminal.show();
        terminal.sendText(copyCommand);

        logger.info('Terminal created and command sent', { device: device.name });

        return terminal;
    }

    /**
     * Check if SSH is available on the system.
     * 
     * @returns True if SSH is available
     */
    public async isSSHAvailable(): Promise<boolean> {
        try {
            await new Promise<void>((resolve, reject) => {
                const sshProcess = spawn('ssh', ['-V']);

                sshProcess.on('close', (code) => {
                    // ssh -V returns 0 on success (or sometimes outputs to stderr but exits 0)
                    if (code === 0 || code === null) {
                        resolve();
                    } else {
                        reject(new Error(`ssh -V failed with exit code ${code}`));
                    }
                });

                sshProcess.on('error', (err) => {
                    reject(err);
                });
            });
            return true;
        } catch (error) {
            logger.warn('SSH not available', { error });
            return false;
        }
    }

    /**
     * Generate platform-specific commands for manual SSH setup.
     * 
     * @param device The device to generate commands for
     * @returns Object containing commands for different platforms
     */
    public generateManualSetupCommands(device: Device): ManualSSHCommands {
        const homeDir = os.homedir();
        const sshDir = path.join(homeDir, '.ssh');
        const sshDirExists = fs.existsSync(sshDir);

        // Key generation commands
        const winKeyGenBase = `ssh-keygen -t rsa -b 4096 -f "$Env:USERPROFILE/.ssh/id_rsa" -N [String]::Empty`;
        const posixKeyGenBase = `ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""`;


        const windowsKeyGen = sshDirExists
            ? winKeyGenBase
            : `if (!(Test-Path "$Env:USERPROFILE/.ssh")) { New-Item -ItemType Directory -Path "$Env:USERPROFILE/.ssh" | Out-Null }; ${winKeyGenBase}`;

        const posixPre = 'mkdir -p ~/.ssh && ';
        const linuxKeyGen = `${posixPre}${posixKeyGenBase}`;
        const macKeyGen = `${posixPre}${posixKeyGenBase}`;

        // Key copy commands
        const windowsCopy = `Get-Content -Raw "$Env:USERPROFILE/.ssh/id_ed25519.pub" | ssh${device.port !== 22 ? ` -p ${device.port}` : ''} ${device.username}@${device.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
        const posixCopy = `ssh-copy-id${device.port !== 22 ? ` -p ${device.port}` : ''} ${device.username}@${device.host}`;

        // Test command (platform-independent)
        const testCommand = `ssh${device.port !== 22 ? ` -p ${device.port}` : ''} ${device.username}@${device.host}`;

        return {
            windows: {
                keyGen: windowsKeyGen,
                copy: windowsCopy,
            },
            linux: {
                keyGen: linuxKeyGen,
                copy: posixCopy,
            },
            mac: {
                keyGen: macKeyGen,
                copy: posixCopy,
            },
            testCommand,
        };
    }
}

/**
 * Singleton connection service instance.
 */
export const connectionService = new ConnectionService();
