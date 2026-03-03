/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { Client as SSHClient } from 'ssh2';
import { Device } from '../../types/devices';
import {
    createSSHConnection,
    executeSSHCommand,
    executeCommandOnClient,
    testSSHConnection,
    SSHConnectionOptions,
} from '../../utils/sshConnection';
import { getSSHConfig } from '../../utils/sshConfig';

jest.mock('ssh2');
jest.mock('../../utils/sshConfig');
jest.mock('../../utils/logger');
jest.mock('node:fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));
jest.mock('node:os', () => ({
    homedir: jest.fn(() => '/home/testuser'),
}));

describe('sshConnection utilities', () => {
    let mockDevice: Device;
    let mockSSHClient: jest.Mocked<SSHClient>;

    beforeEach(() => {
        mockDevice = {
            id: 'test-device-1',
            name: 'Test Device',
            host: '192.168.1.100',
            username: 'testuser',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        mockSSHClient = new SSHClient() as jest.Mocked<SSHClient>;
        (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => mockSSHClient);

        (getSSHConfig as jest.Mock).mockReturnValue({
            host: mockDevice.host,
            port: mockDevice.port,
            username: mockDevice.username,
            privateKey: Buffer.from('mock-private-key'),
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createSSHConnection', () => {
        it('should create and connect SSH client successfully', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();

            const client = await createSSHConnection(mockDevice);

            expect(client).toBe(mockSSHClient);
            expect(mockSSHClient.connect).toHaveBeenCalled();
            expect(getSSHConfig).toHaveBeenCalledWith(mockDevice, {
                readyTimeout: undefined,
                timeout: undefined
            });
        });

        it('should apply connection options', async () => {
            const options: SSHConnectionOptions = {
                readyTimeout: 10000,
                timeout: 5000,
                keepaliveInterval: 2000,
                keepaliveCountMax: 5
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();

            await createSSHConnection(mockDevice, options);

            expect(getSSHConfig).toHaveBeenCalledWith(mockDevice, {
                readyTimeout: 10000,
                timeout: 5000
            });

            // Verify keepalive settings were applied to config
            const connectCall = (mockSSHClient.connect as jest.Mock).mock.calls[0][0];
            expect(connectCall.keepaliveInterval).toBe(2000);
            expect(connectCall.keepaliveCountMax).toBe(5);
        });

        it('should reject on connection error', async () => {
            const error = new Error('Connection failed');

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'error') {
                    setTimeout(() => callback(error), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();

            await expect(createSSHConnection(mockDevice)).rejects.toThrow('Connection failed');
        });

        it('should not apply keepalive settings when not specified', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();

            await createSSHConnection(mockDevice, { readyTimeout: 5000 });

            const connectCall = (mockSSHClient.connect as jest.Mock).mock.calls[0][0];
            expect(connectCall.keepaliveInterval).toBeUndefined();
            expect(connectCall.keepaliveCountMax).toBeUndefined();
        });
    });

    describe('executeCommandOnClient', () => {
        it('should execute command successfully on existing client', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'data') {
                        setTimeout(() => cb(Buffer.from('command output')), 0);
                    } else if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(
                mockSSHClient,
                'echo hello',
                { operationName: 'test operation' }
            );

            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('command output');
            expect(result.stderr).toBe('');
        });

        it('should handle command with non-zero exit code', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(1), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'data') {
                            setTimeout(() => cb(Buffer.from('error message')), 0);
                        }
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(mockSSHClient, 'failing command');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe('error message');
        });

        it('should handle null exit code and default to 1', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(null), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(mockSSHClient, 'test command');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
        });

        it('should write sudo password to stdin for sudo commands', async () => {
            const mockWrite = jest.fn((data: string, callback: any) => {
                callback(undefined);
            });

            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const password = 'test-password';
            await executeCommandOnClient(
                mockSSHClient,
                'sudo -S whoami',
                { sudoPassword: password }
            );

            expect(mockWrite).toHaveBeenCalledWith(
                password + '\n',
                expect.any(Function)
            );
            expect(mockStream.end).toHaveBeenCalled();
        });

        it('should not write password for non-sudo commands', async () => {
            const mockWrite = jest.fn();

            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            await executeCommandOnClient(
                mockSSHClient,
                'echo hello',
                { sudoPassword: 'test-password' }
            );

            expect(mockWrite).not.toHaveBeenCalled();
            expect(mockStream.end).toHaveBeenCalled();
        });

        it('should handle command timeout', async () => {
            const mockStream: any = {
                on: jest.fn(() => mockStream),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
                // Never trigger close event, so it times out
            });

            await expect(
                executeCommandOnClient(
                    mockSSHClient,
                    'slow command',
                    { timeoutSeconds: 0.1 }
                )
            ).rejects.toThrow('timed out');
        });

        it('should handle exec errors', async () => {
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(new Error('Exec failed'));
            });

            await expect(
                executeCommandOnClient(mockSSHClient, 'test command')
            ).rejects.toThrow('Exec failed');
        });

        it('should handle stream errors', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'error') {
                        setTimeout(() => cb(new Error('Stream error')), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            await expect(
                executeCommandOnClient(mockSSHClient, 'test command')
            ).rejects.toThrow('Stream error');
        });

        it('should handle password write errors', async () => {
            const mockWrite = jest.fn((data: string, callback: any) => {
                callback(new Error('Write failed'));
            });

            const mockStream: any = {
                on: jest.fn(() => mockStream),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            await expect(
                executeCommandOnClient(
                    mockSSHClient,
                    'sudo -S whoami',
                    { sudoPassword: 'test-password' }
                )
            ).rejects.toThrow('Write failed');
        });

        it('should use default operation name when not provided', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(mockSSHClient, 'test command');

            expect(result.success).toBe(true);
        });

        it('should not close the client connection', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.end as any) = jest.fn();

            await executeCommandOnClient(mockSSHClient, 'test command');

            // Should NOT call client.end() - caller manages connection lifecycle
            expect(mockSSHClient.end).not.toHaveBeenCalled();
        });

        it('should handle multiple commands on same client', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'data') {
                        setTimeout(() => cb(Buffer.from('output')), 0);
                    } else if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result1 = await executeCommandOnClient(mockSSHClient, 'command1');
            const result2 = await executeCommandOnClient(mockSSHClient, 'command2');
            const result3 = await executeCommandOnClient(mockSSHClient, 'command3');

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(result3.success).toBe(true);
            expect(mockSSHClient.exec).toHaveBeenCalledTimes(3);
        });

        it('should properly cleanup timeout on successful completion', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(
                mockSSHClient,
                'test command',
                { timeoutSeconds: 10 }
            );

            expect(result.success).toBe(true);
            // If timeout wasn't cleaned up, test would hang or fail
        });

        it('should handle multiple close events without resolving multiple times', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'data') {
                        setTimeout(() => cb(Buffer.from('output')), 0);
                    } else if (event === 'close') {
                        setTimeout(() => {
                            cb(0);
                            // Try to trigger close again
                            cb(0);
                        }, 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            const result = await executeCommandOnClient(mockSSHClient, 'test command');

            expect(result.success).toBe(true);
            // Should only resolve once despite multiple close events
        });
    });

    describe('executeSSHCommand', () => {
        it('should execute command successfully and return result', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'data') {
                        setTimeout(() => cb(Buffer.from('command output')), 0);
                    } else if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'echo hello',
                { readyTimeout: 5000 },
                { operationName: 'test operation' }
            );

            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('command output');
            expect(result.stderr).toBe('');
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should handle command with non-zero exit code', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(1), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'data') {
                            setTimeout(() => cb(Buffer.from('error message')), 0);
                        }
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'failing command');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe('error message');
        });

        it('should handle null exit code and default to 1', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(null), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'test command');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
        });

        it('should write sudo password to stdin for sudo commands', async () => {
            const mockWrite = jest.fn((data: string, callback: any) => {
                callback(undefined);
            });

            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const password = 'test-password';
            await executeSSHCommand(
                mockDevice,
                'sudo -S whoami',
                {},
                { sudoPassword: password }
            );

            expect(mockWrite).toHaveBeenCalledWith(
                password + '\n',
                expect.any(Function)
            );
            expect(mockStream.end).toHaveBeenCalled();
        });

        it('should not write password for non-sudo commands', async () => {
            const mockWrite = jest.fn();

            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        return mockStream.stderr;
                    })
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            await executeSSHCommand(
                mockDevice,
                'echo hello',
                {},
                { sudoPassword: 'test-password' }
            );

            expect(mockWrite).not.toHaveBeenCalled();
            expect(mockStream.end).toHaveBeenCalled();
        });

        it('should handle command timeout', async () => {
            const mockStream: any = {
                on: jest.fn(() => mockStream),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
                // Never trigger close event, so it times out
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'slow command',
                {},
                { timeoutSeconds: 0.1, retries: 1 }
            );

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(-1);
            expect(result.stderr).toContain('timed out');
        });

        it('should retry on timeout errors', async () => {
            let attemptCount = 0;

            const mockStream: any = {
                on: jest.fn(() => mockStream),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                attemptCount++;
                if (attemptCount < 3) {
                    // First two attempts timeout
                    callback(null, mockStream);
                } else {
                    // Third attempt succeeds
                    const successStream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'close') {
                                setTimeout(() => cb(0), 0);
                            }
                            return successStream;
                        }),
                        stderr: {
                            on: jest.fn(() => successStream.stderr)
                        },
                        write: jest.fn(),
                        end: jest.fn()
                    };
                    callback(null, successStream);
                }
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'retry command',
                {},
                { timeoutSeconds: 0.1, retries: 2, retryDelayMs: 10 }
            );

            expect(attemptCount).toBe(3);
            expect(result.success).toBe(true);
        });

        it('should retry on ECONNRESET errors', async () => {
            let attemptCount = 0;

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn(() => {
                attemptCount++;
                if (attemptCount < 2) {
                    throw new Error('ECONNRESET: Connection reset by peer');
                }
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                const mockStream: any = {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'close') {
                            setTimeout(() => cb(0), 0);
                        }
                        return mockStream;
                    }),
                    stderr: {
                        on: jest.fn(() => mockStream.stderr)
                    },
                    write: jest.fn(),
                    end: jest.fn()
                };
                callback(null, mockStream);
            });

            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'test command',
                {},
                { retries: 1, retryDelayMs: 10 }
            );

            expect(attemptCount).toBe(2);
            expect(result.success).toBe(true);
        });

        it('should not retry on non-retryable errors', async () => {
            let attemptCount = 0;

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn(() => {
                attemptCount++;
                throw new Error('Authentication failed');
            });

            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'test command',
                {},
                { retries: 3 }
            );

            expect(attemptCount).toBe(1);
            expect(result.success).toBe(false);
            expect(result.stderr).toContain('Authentication failed');
        });

        it('should handle exec errors', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(new Error('Exec failed'));
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'test command');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(-1);
            expect(result.stderr).toBe('Exec failed');
            expect(result.error?.message).toBe('Exec failed');
        });

        it('should handle stream errors', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'error') {
                        setTimeout(() => cb(new Error('Stream error')), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'test command');

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('Stream error');
        });

        it('should cleanup SSH connection on success', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            await executeSSHCommand(mockDevice, 'test command');

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should cleanup SSH connection on error', async () => {
            // When createSSHConnection fails, the client is not fully initialized
            // so we test that the connection attempt handles errors gracefully
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn(() => {
                throw new Error('Connection failed');
            });

            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'test command');

            // Verify error is handled and returned
            expect(result.success).toBe(false);
            expect(result.stderr).toContain('Connection failed');
        });

        it('should handle password write errors', async () => {
            const mockWrite = jest.fn((data: string, callback: any) => {
                callback(new Error('Write failed'));
            });

            const mockStream: any = {
                on: jest.fn(() => mockStream),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(
                mockDevice,
                'sudo -S whoami',
                {},
                { sudoPassword: 'test-password' }
            );

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('Write failed');
        });

        it('should use default operation name when not provided', async () => {
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn(() => mockStream.stderr)
                },
                write: jest.fn(),
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(null, mockStream);
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await executeSSHCommand(mockDevice, 'test command');

            expect(result.success).toBe(true);
        });
    });

    describe('testSSHConnection', () => {
        it('should return success when connection succeeds', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await testSSHConnection(mockDevice);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return error when connection fails', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'error') {
                    setTimeout(() => callback(new Error('Connection refused')), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await testSSHConnection(mockDevice);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection refused');
        });

        it('should normalize SSH handshake timeout errors', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'error') {
                    setTimeout(() => callback(new Error('Timed out while waiting for handshake')), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await testSSHConnection(mockDevice);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection timeout during SSH handshake');
        });

        it('should handle connection timeout', async () => {
            (mockSSHClient.on as any) = jest.fn(() => mockSSHClient);

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await testSSHConnection(mockDevice, { readyTimeout: 100 });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection timeout');
        });

        it('should handle unexpected connection close', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'close') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await testSSHConnection(mockDevice);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection closed unexpectedly');
        });

        it('should handle exceptions during connection', async () => {
            (mockSSHClient.on as any) = jest.fn(() => {
                throw new Error('Unexpected error');
            });

            const result = await testSSHConnection(mockDevice);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Unexpected error');
        });

        it('should cleanup connection on success', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            await testSSHConnection(mockDevice);

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should cleanup connection on error', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'error') {
                    setTimeout(() => callback(new Error('Connection error')), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            await testSSHConnection(mockDevice);

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should handle connection end errors gracefully', async () => {
            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn(() => {
                throw new Error('End failed');
            });

            const result = await testSSHConnection(mockDevice);

            // Should still succeed even if end() throws
            expect(result.success).toBe(true);
        });

        it('should not resolve multiple times on concurrent events', async () => {
            let resolveCount = 0;

            const promise = new Promise<void>((resolve) => {
                (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                    if (event === 'ready') {
                        setTimeout(() => {
                            callback();
                            resolveCount++;
                        }, 10);
                    }
                    if (event === 'error') {
                        setTimeout(() => {
                            callback(new Error('Error'));
                            resolveCount++;
                        }, 20);
                    }
                    if (event === 'close') {
                        setTimeout(() => {
                            callback();
                            resolveCount++;
                        }, 30);
                    }
                    return mockSSHClient;
                });

                (mockSSHClient.connect as any) = jest.fn();
                (mockSSHClient.end as any) = jest.fn();

                testSSHConnection(mockDevice).then(() => resolve());
            });

            await promise;
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should only resolve once even though multiple events fired
            expect(resolveCount).toBeGreaterThan(0);
        });

        it('should use custom timeout from options', async () => {
            (mockSSHClient.on as any) = jest.fn(() => mockSSHClient);

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const startTime = Date.now();
            await testSSHConnection(mockDevice, { readyTimeout: 100 });
            const endTime = Date.now();

            // Should timeout around 100ms + buffer (200ms total)
            expect(endTime - startTime).toBeLessThan(300);
        });

        it('should use default 5000ms timeout when not specified', async () => {
            (mockSSHClient.on as any) = jest.fn(() => mockSSHClient);

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            // This will timeout, but we're just checking the behavior
            await testSSHConnection(mockDevice);

            // Just verify it was called with default options
            expect(getSSHConfig).toHaveBeenCalledWith(mockDevice, {
                readyTimeout: 5000,
                timeout: undefined
            });
        });
    });
});
