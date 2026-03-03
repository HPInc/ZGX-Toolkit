/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Shared SSH connection utility for creating SSH connections and executing commands.
 * Provides configurable timeout, keepalive, and retry options for different use cases.
 */

import { Client as SSHClient } from 'ssh2';
import { Device } from '../types/devices';
import { SSHCommandResult } from '../types/ssh';
import { logger } from './logger';
import { getSSHConfig } from './sshConfig';

/**
 * Options for SSH connection configuration
 */
export interface SSHConnectionOptions {
    /**
     * Ready timeout in milliseconds (time to wait for connection to be ready)
     */
    readyTimeout?: number;

    /**
     * Socket timeout in milliseconds
     */
    timeout?: number;

    /**
     * Keepalive interval in milliseconds (0 to disable)
     */
    keepaliveInterval?: number;

    /**
     * Maximum number of keepalive packets to miss before disconnecting
     */
    keepaliveCountMax?: number;
}

/**
 * Options for SSH command execution
 */
export interface SSHCommandExecutionOptions {
    /**
     * Operation name for logging purposes
     */
    operationName?: string;

    /**
     * Sudo password for commands starting with 'sudo -S'
     */
    sudoPassword?: string;

    /**
     * Command timeout in seconds
     */
    timeoutSeconds?: number;

    /**
     * Number of retry attempts on timeout or connection reset
     */
    retries?: number;

    /**
     * Delay in milliseconds between retry attempts
     */
    retryDelayMs?: number;
}

/**
 * Result of testing SSH connection
 */
export interface SSHConnectionTestResult {
    success: boolean;
    error?: string;
}

/**
 * Create and establish an SSH connection to a device.
 * 
 * @param device The device to connect to
 * @param options Optional connection configuration
 * @returns Promise resolving to connected SSH client
 */
export async function createSSHConnection(
    device: Device,
    options?: SSHConnectionOptions
): Promise<SSHClient> {
    return new Promise((resolve, reject) => {
        const client = new SSHClient();

        client.on('ready', () => {
            resolve(client);
        });

        client.on('error', (err) => {
            reject(err);
        });

        // Get SSH configuration including credentials from ~/.ssh/config
        const config = getSSHConfig(device, {
            readyTimeout: options?.readyTimeout,
            timeout: options?.timeout
        });

        // Apply keepalive settings if specified
        if (options?.keepaliveInterval !== undefined) {
            config.keepaliveInterval = options.keepaliveInterval;
        }
        if (options?.keepaliveCountMax !== undefined) {
            config.keepaliveCountMax = options.keepaliveCountMax;
        }

        logger.debug('Connecting to SSH host', {
            host: config.host,
            port: config.port,
            username: config.username,
            hasPrivateKey: !!config.privateKey,
            hasAgent: !!config.agent,
            readyTimeout: options?.readyTimeout,
            timeout: options?.timeout,
            keepaliveInterval: options?.keepaliveInterval
        });

        client.connect(config);
    });
}

/**
 * Execute a command on an existing SSH client connection.
 * Does NOT create or close the connection - caller is responsible for connection lifecycle.
 * Useful when executing multiple commands over the same connection.
 * 
 * @param client Existing connected SSH client
 * @param command The command to execute
 * @param executionOptions Optional command execution configuration
 * @returns Promise resolving to command result
 */
export async function executeCommandOnClient(
    client: SSHClient,
    command: string,
    executionOptions?: SSHCommandExecutionOptions
): Promise<SSHCommandResult> {
    const operationName = executionOptions?.operationName || 'SSH operation';

    return new Promise<SSHCommandResult>((resolve, reject) => {
        let timeoutHandle: NodeJS.Timeout | undefined;
        let resolved = false;

        const cleanup = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        };

        const safeResolve = (value: SSHCommandResult) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (error: Error) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(error);
            }
        };

        // Set up timeout if specified
        if (executionOptions?.timeoutSeconds) {
            timeoutHandle = setTimeout(() => {
                safeReject(new Error(`SSH command timed out after ${executionOptions.timeoutSeconds} seconds`));
            }, executionOptions.timeoutSeconds * 1000);
        }

        client.exec(command, (err, stream) => {
            if (err) {
                logger.error(`Failed to execute SSH command for ${operationName}`, { error: err.message });
                safeReject(err);
                return;
            }

            let stdout = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            stream.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            stream.on('close', (code: number | null, signal?: string) => {
                // Handle null/undefined exit codes - use 1 as default for failure
                const exitCode = code ?? 1;
                
                if (code === null || code === undefined) {
                    logger.warn(`Stream closed without providing an exit code for ${operationName}. Defaulting to exit code 1.`, {
                        signal,
                        stdout: stdout.slice(-200),
                        stderr: stderr.slice(-200)
                    });
                } else {
                    logger.debug(`Command completed for ${operationName}`, {
                        exitCode,
                        signal,
                        hasStdout: stdout.length > 0,
                        hasStderr: stderr.length > 0
                    });
                }

                safeResolve({
                    success: exitCode === 0,
                    exitCode,
                    stdout,
                    stderr
                });
            });

            stream.on('error', (streamErr: Error) => {
                logger.error(`Stream error for ${operationName}`, { error: streamErr.message });
                safeReject(streamErr);
            });

            // If password is provided and command is sudo, write it to stdin and close stdin
            if (executionOptions?.sudoPassword && command.startsWith('sudo -S')) {
                stream.write(executionOptions.sudoPassword + '\n', (err) => {
                    if (err) {
                        logger.error(`Failed to write sudo password for ${operationName}`, { error: err.message });
                        safeReject(err);
                        return;
                    }
                    stream.end();
                });
            } else {
                // No password needed, just close stdin
                stream.end();
            }
        });
    });
}

/**
 * Execute a command on a remote device via SSH.
 * Creates SSH connection, executes command, handles retries, and cleans up.
 * This is a convenience wrapper around createSSHConnection and executeCommandOnClient.
 * 
 * @param device The device to execute command on
 * @param command The command to execute
 * @param connectionOptions Optional SSH connection configuration
 * @param executionOptions Optional command execution configuration
 * @returns Promise resolving to command result
 */
export async function executeSSHCommand(
    device: Device,
    command: string,
    connectionOptions?: SSHConnectionOptions,
    executionOptions?: SSHCommandExecutionOptions
): Promise<SSHCommandResult> {
    const operationName = executionOptions?.operationName || 'SSH operation';
    const retries = executionOptions?.retries ?? 0;
    const retryDelay = executionOptions?.retryDelayMs ?? 1000;
    const totalAttempts = Math.max(1, retries + 1);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        let client: SSHClient | undefined;

        try {
            const attemptText = totalAttempts > 1 && attempt > 1 ? ` (attempt ${attempt}/${totalAttempts})` : '';
            logger.debug(`Executing SSH command for ${operationName}${attemptText}`);

            // Connect to device
            client = await createSSHConnection(device, connectionOptions);

            // Execute command on the connected client
            const result = await executeCommandOnClient(client, command, executionOptions);

            return result;

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if error is retryable (timeout or connection reset)
            const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
            const isRetryable =
                errorMessage.includes('timed out') ||
                errorMessage.includes('timeout') ||
                errorMessage.includes('econnreset');

            if (isRetryable && attempt < totalAttempts) {
                logger.warn(`Command error for ${operationName} (attempt ${attempt}/${totalAttempts})`, {
                    error: lastError.message
                });
                logger.info(`Retrying command for ${operationName}...`);
                
                // Add delay before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            // For non-retryable errors or final attempt, log and return error
            logger.error(`Command exception for ${operationName}`, {
                error: lastError.message,
                attempt: attempt,
                maxRetries: retries
            });

            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: lastError.message,
                error: lastError
            };
        } finally {
            // Always close the client connection
            if (client) {
                try {
                    client.end();
                } catch (err) {
                    logger.debug(`Error closing SSH client for ${operationName}`, {
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }
    }

    // Total attempts exhausted
    logger.error(`Command failed for ${operationName} after ${totalAttempts} attempts`, {
        lastError: lastError?.message
    });

    return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: lastError?.message || 'Unknown error',
        error: lastError
    };
}

/**
 * Test SSH connection to device without executing commands.
 * Establishes connection and immediately closes it.
 * 
 * @param device The device to test
 * @param options Optional connection configuration
 * @returns Promise resolving to connection test result
 */
export async function testSSHConnection(
    device: Device,
    options?: SSHConnectionOptions
): Promise<SSHConnectionTestResult> {
    let client: SSHClient | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;

    return new Promise((resolve) => {
        try {
            client = new SSHClient();
            let connected = false;
            let resolved = false;

            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = undefined;
                }
                if (client) {
                    try {
                        // Attempt to gracefully close the connection
                        client.end();
                    } catch (error) {
                        logger.debug('SSH client cleanup: connection already closed or in error state', {
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            };

            const resolveOnce = (result: SSHConnectionTestResult) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(result);
                }
            };

            client.on('ready', () => {
                connected = true;
                resolveOnce({ success: true });
            });

            client.on('error', (err) => {
                let errorMessage = err.message;
                
                // Normalize timeout errors for better user-facing messages
                if (errorMessage.includes('Timed out while waiting for handshake')) {
                    errorMessage = 'Connection timeout during SSH handshake';
                }
                
                logger.debug('SSH connection error during test', {
                    device: device.name,
                    error: err.message
                });
                resolveOnce({ success: false, error: errorMessage });
            });

            client.on('close', () => {
                if (!connected && !resolved) {
                    resolveOnce({ success: false, error: 'Connection closed unexpectedly' });
                }
            });

            // Set timeout for connection attempt with a small buffer beyond the SSH library's timeout
            // to ensure the library's more specific error messages are reported first
            const connectionTimeout = options?.readyTimeout ?? 5000;
            timeoutHandle = setTimeout(() => {
                logger.debug('SSH connection timeout during test', { device: device.name });
                resolveOnce({ success: false, error: 'Connection timeout' });
            }, connectionTimeout + 100);

            // Get SSH configuration and connect
            const config = getSSHConfig(device, {
                readyTimeout: connectionTimeout,
                timeout: options?.timeout
            });
            client.connect(config);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug('Exception during SSH connection test', {
                device: device.name,
                error: errorMessage
            });
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            resolve({ success: false, error: errorMessage });
        }
    });
}
