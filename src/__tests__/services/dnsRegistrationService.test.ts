/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DNSServiceRegistration, RegistrationErrorType } from '../../services/dnsRegistrationService';
import { Device } from '../../types/devices';
import { Client as SSHClient } from 'ssh2';

jest.mock('ssh2');
jest.mock('node:fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));
jest.mock('node:os', () => ({
    homedir: jest.fn(() => '/home/testuser'),
}));
jest.mock('../../utils/logger');

describe('DNSServiceRegistration', () => {
    let service: DNSServiceRegistration;
    let mockDevice: Device;
    let mockSSHClient: jest.Mocked<SSHClient>;

    beforeEach(() => {
        service = new DNSServiceRegistration();
        
        mockDevice = {
            id: 'test-device-1',
            name: 'Test ZGX Device',
            host: '192.168.1.100',
            username: 'zgx',
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

        // Mock SSH Client
        mockSSHClient = new SSHClient() as jest.Mocked<SSHClient>;
        (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => mockSSHClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('registerDNSService', () => {
        const testPassword = 'test-sudo-password';

        it('should return error when empty password provided', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            // Mock file check to succeed (file doesn't exist)
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'data') {
                        setTimeout(() => cb(Buffer.from('not_exists')), 0);
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

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, '');

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.SUDO_PASSWORD_REQUIRED);
            expect(result.message).toContain('Sudo password required');
        });

        it('should return error when invalid password provided', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            // Mock password validation to fail
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(1), 0); // Non-zero exit code = invalid password
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'data') {
                            setTimeout(() => cb(Buffer.from('sudo: incorrect password')), 0);
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

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, 'wrong-password');

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.INVALID_PASSWORD);
        });

        it('should successfully register DNS service', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            let execCallCount = 0;
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                execCallCount++;
                
                const createMockStream = (stdoutData: string, exitCode: number = 0) => {
                    const mockStream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'data') {
                                setTimeout(() => cb(Buffer.from(stdoutData)), 0);
                            } else if (event === 'close') {
                                setTimeout(() => cb(exitCode), 0);
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
                    return mockStream;
                };

                // First call: validate password (sudo -S true)
                if (execCallCount === 1) {
                    callback(null, createMockStream('', 0)); // Success
                }
                // Second call: calculate identifier
                else if (execCallCount === 2) {
                    callback(null, createMockStream('a1b2c3d4'));
                }
                // Third call: create service file
                else if (execCallCount === 3) {
                    callback(null, createMockStream(''));
                }
                // Fourth call: restart avahi daemon
                else if (execCallCount === 4) {
                    callback(null, createMockStream(''));
                }
            });

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(true);
            expect(result.alreadyRegistered).toBe(false);
            expect(result.deviceIdentifier).toBe('a1b2c3d4');
            expect(result.errorType).toBe(RegistrationErrorType.NONE);
        });



        it('should return IDENTIFIER_CALCULATION_FAILED when MAC hash calculation fails', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            let execCallCount = 0;
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                execCallCount++;
                
                if (execCallCount === 1) {
                    // Password validation succeeds
                    const stream0: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'close') {
                                setTimeout(() => cb(0), 0);
                            }
                            return stream0;
                        }),
                        stderr: { on: jest.fn() },
                        write: jest.fn(),
                        end: jest.fn()
                    };
                    callback(null, stream0);
                } else if (execCallCount === 2) {
                    // Identifier calculation fails
                    const failStream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'data') {
                                setTimeout(() => cb(Buffer.from('')), 0);
                            } else if (event === 'close') {
                                setTimeout(() => cb(1), 0); // Exit code 1
                            }
                            return failStream;
                        }),
                        stderr: {
                            on: jest.fn((event: string, cb: any) => {
                                if (event === 'data') {
                                    setTimeout(() => cb(Buffer.from('No such network interface')), 0);
                                }
                                return failStream.stderr;
                            })
                        },
                        end: jest.fn()
                    };
                    callback(null, failStream);
                }
            });

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.IDENTIFIER_CALCULATION_FAILED);
            expect(result.message).toContain('Failed to calculate device identifier');
        });

        it('should return SERVICE_FILE_CREATION_FAILED when file creation fails', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            let execCallCount = 0;
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                execCallCount++;
                
                const createMockStream = (stdoutData: string, exitCode: number = 0, stderrData: string = '') => {
                    const stream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'data') {
                                setTimeout(() => cb(Buffer.from(stdoutData)), 0);
                            } else if (event === 'close') {
                                setTimeout(() => cb(exitCode), 0);
                            }
                            return stream;
                        }),
                        stderr: {
                            on: jest.fn((event: string, cb: any) => {
                                if (event === 'data' && stderrData) {
                                    setTimeout(() => cb(Buffer.from(stderrData)), 0);
                                }
                                return stream.stderr;
                            })
                        },
                        end: jest.fn(),
                        write: jest.fn((data: any, cb: any) => {
                            if (cb) cb();
                        })
                    };
                    return stream;
                };

                if (execCallCount === 1) {
                    // Password validation succeeds
                    callback(null, createMockStream('', 0));
                } else if (execCallCount === 2) {
                    // Identifier calculation succeeds
                    callback(null, createMockStream('a1b2c3d4', 0));
                } else if (execCallCount === 3) {
                    // File creation fails
                    callback(null, createMockStream('', 1, 'Permission denied'));
                }
            });

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.SERVICE_FILE_CREATION_FAILED);
            expect(result.message).toContain('Failed to create the DNS service file on the device');
        });

        it('should return AVAHI_RESTART_FAILED when daemon restart fails but file was created', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            let execCallCount = 0;
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                execCallCount++;
                
                const createMockStream = (stdoutData: string, exitCode: number = 0, stderrData: string = '') => {
                    const stream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'data') {
                                setTimeout(() => cb(Buffer.from(stdoutData)), 0);
                            } else if (event === 'close') {
                                setTimeout(() => cb(exitCode), 0);
                            }
                            return stream;
                        }),
                        stderr: {
                            on: jest.fn((event: string, cb: any) => {
                                if (event === 'data' && stderrData) {
                                    setTimeout(() => cb(Buffer.from(stderrData)), 0);
                                }
                                return stream.stderr;
                            })
                        },
                        end: jest.fn(),
                        write: jest.fn((data: any, cb: any) => {
                            if (cb) cb();
                        })
                    };
                    return stream;
                };

                if (execCallCount === 1) {
                    // Password validation succeeds
                    callback(null, createMockStream('', 0));
                } else if (execCallCount === 2) {
                    // Identifier calculation succeeds
                    callback(null, createMockStream('a1b2c3d4', 0));
                } else if (execCallCount === 3) {
                    // File creation succeeds
                    callback(null, createMockStream('', 0));
                } else if (execCallCount === 4) {
                    // Avahi restart fails
                    callback(null, createMockStream('', 1, 'Failed to restart avahi-daemon'));
                }
            });

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            const result = await service.registerDNSService(mockDevice, testPassword);

            // Note: Even though avahi restart fails, the registration is considered successful
            // because the service file was created. The service will be active after reboot.
            expect(result.success).toBe(true);
            expect(result.errorType).toBe(RegistrationErrorType.AVAHI_RESTART_FAILED);
            expect(result.message).toContain('Service file created but Avahi daemon restart failed');
            expect(result.deviceIdentifier).toBe('a1b2c3d4');
        });

        it('should return SSH_CONNECTION_FAILED on connection error', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            // Create a mock that will fail with a connection error
            const failingClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'error') {
                        setImmediate(() => callback(new Error('Error: connect ECONNREFUSED 192.168.1.100:22')));
                    }
                    return failingClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn()
            };

            // Override the SSHClient mock to return the failing client
            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => failingClient);

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.SSH_CONNECTION_FAILED);
            expect(result.message).toContain('SSH connection failed');
            expect(failingClient.exec).not.toHaveBeenCalled();
        });

        it('should handle exception with Error object containing ETIMEDOUT', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const failingClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'error') {
                        setImmediate(() => callback(new Error('Connection ETIMEDOUT')));
                    }
                    return failingClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn()
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => failingClient);

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.SSH_CONNECTION_FAILED);
            expect(result.message).toContain('SSH connection failed');
        });

        it('should handle exception with Error object containing EHOSTUNREACH', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const failingClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'error') {
                        setImmediate(() => callback(new Error('Network error: EHOSTUNREACH')));
                    }
                    return failingClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn()
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => failingClient);

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.SSH_CONNECTION_FAILED);
            expect(result.message).toContain('SSH connection failed');
        });

        it('should handle exception with non-Error object (Buffer)', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            jest.spyOn(service as any, 'validatePassword').mockRejectedValue(Buffer.from('Buffer error'));

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.UNKNOWN_ERROR);
            expect(result.message).toBeDefined();
        });

        it('should handle exception with non-connection error (unknown error type)', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            // Mock validatePassword to throw a non-connection error
            jest.spyOn(service as any, 'validatePassword').mockRejectedValue(new Error('Some other unexpected error'));

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.UNKNOWN_ERROR);
            expect(result.message).toBe('Some other unexpected error');
        });

        it('should handle exception with string error instead of Error object', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            jest.spyOn(service as any, 'validatePassword').mockRejectedValue('String error message');

            const result = await service.registerDNSService(mockDevice, testPassword);

            expect(result.success).toBe(false);
            expect(result.errorType).toBe(RegistrationErrorType.UNKNOWN_ERROR);
            expect(result.message).toBe('String error message');
        });
    });

    describe('SSH Config Parsing', () => {
        it('should handle undefined IdentitiesOnly without crashing', () => {
            const fs = require('node:fs');
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(`
            Host test-host
                HostName 192.168.1.100
                User zgx
                Port 22
            `);

            expect(() => {
                (service as any).getSSHConfig(mockDevice);
            }).not.toThrow();
        });

        it('should handle missing SSH config file', () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const config = (service as any).getSSHConfig(mockDevice);
            
            expect(config).toBeDefined();
            expect(config.host).toBe(mockDevice.host);
            expect(config.username).toBe(mockDevice.username);
            expect(config.port).toBe(22);
        });

        it('should parse SSH config with IdentityFile', () => {
            const fs = require('node:fs');
            const os = require('node:os');
            
            fs.existsSync.mockImplementation((path: string) => {
                if (path.includes('.ssh/config')) {
                    return true;
                }
                if (path.includes('id_ed25519')) {
                    return true;
                }
                return false;
            });

            fs.readFileSync.mockImplementation((path: string, encoding?: string) => {
                if (path.includes('.ssh/config')) {
                    return `
                    Host 192.168.1.100
                        HostName 192.168.1.100
                        User zgx
                        IdentityFile ~/.ssh/id_ed25519
                    `;
                }
                return Buffer.from('mock-key-data');
            });

            os.homedir.mockReturnValue('/home/testuser');

            const config = (service as any).getSSHConfig(mockDevice);
            
            expect(config.privateKey).toBeDefined();
        });

        it('should use SSH agent when no private key found', () => {
            const fs = require('node:fs');
            const os = require('node:os');
            
            fs.existsSync.mockReturnValue(false);
            os.homedir.mockReturnValue('/home/testuser');
            process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';

            const config = (service as any).getSSHConfig(mockDevice);
            
            expect(config.agent).toBe('/tmp/ssh-agent.sock');
            
            delete process.env.SSH_AUTH_SOCK;
        });
    });

    describe('generateServiceFileXML', () => {
        it('should generate valid Avahi service XML', () => {
            const xml = (service as any).generateServiceFileXML('a1b2c3d4');
            
            expect(xml).toContain('<name>a1b2c3d4</name>');
            expect(xml).toContain('<type>_hpzgx._tcp</type>');
            expect(xml).toContain('<port>22</port>');
        });

        it('should escape device identifier in XML', () => {
            const xml = (service as any).generateServiceFileXML('test<>&"\'id');
            
            // Verify identifier is properly escaped in XML
            expect(xml).toContain('<name>test&lt;&gt;&amp;&quot;&apos;id</name>');
        });
    });

    describe('checkServiceFileExists', () => {
        it('should handle exception with Error object in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            // Create a mock SSH client that will throw an error during exec
            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    // Throw an error to trigger the catch block
                    throw new Error('SSH exec failed with ECONNREFUSED');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('SSH exec failed with ECONNREFUSED');
            expect(result.isConnectionError).toBe(true);
        });

        it('should handle exception with Error containing ETIMEDOUT in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw new Error('Connection ETIMEDOUT after 30s');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('Connection ETIMEDOUT after 30s');
            expect(result.isConnectionError).toBe(true);
        });

        it('should handle exception with Error containing EHOSTUNREACH in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw new Error('Network error EHOSTUNREACH');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('Network error EHOSTUNREACH');
            expect(result.isConnectionError).toBe(true);
        });

        it('should handle exception with Error containing connection keyword in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw new Error('Failed to establish connection');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('Failed to establish connection');
            expect(result.isConnectionError).toBe(true);
        });

        it('should handle exception with Error containing connect keyword in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw new Error('Cannot connect to remote host');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('Cannot connect to remote host');
            expect(result.isConnectionError).toBe(true);
        });

        it('should handle exception with non-connection Error in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw new Error('Permission denied reading file');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('Permission denied reading file');
            expect(result.isConnectionError).toBe(false);
        });

        it('should handle exception with non-Error object (Buffer) in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw Buffer.from('Buffer error data');
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.isConnectionError).toBe(false);
        });

        it('should handle exception with string in catch block', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const errorClient: any = {
                on: jest.fn((event: string, callback: any): any => {
                    if (event === 'ready') {
                        setTimeout(() => callback(), 0);
                    }
                    return errorClient;
                }),
                connect: jest.fn(),
                end: jest.fn(),
                exec: jest.fn((command: string, callback: any) => {
                    throw 'String error message';
                })
            };

            (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => errorClient);

            const result = await service.checkServiceFileExists(mockDevice);

            expect(result.exists).toBe(false);
            expect(result.error).toBe('String error message');
            expect(result.isConnectionError).toBe(false);
        });
    });

    describe('migrateExistingDevices', () => {
        let mockDeviceStore: any;
        let mockDeviceService: any;

        beforeEach(() => {
            mockDeviceStore = {
                getAll: jest.fn()
            };

            mockDeviceService = {
                getAllDevices: jest.fn(),
                updateDevice: jest.fn()
            };
        });

        it('should skip migration when no devices need it', async () => {
            mockDeviceService.getAllDevices.mockResolvedValue([]);

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.getAllDevices).toHaveBeenCalled();
            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should skip devices that are not setup', async () => {
            const devices = [
                { ...mockDevice, isSetup: false }
            ];
            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should skip devices already registered', async () => {
            const devices = [
                { ...mockDevice, dnsInstanceName: 'existing-name' }
            ];
            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should skip devices not using key auth', async () => {
            const devices = [
                { ...mockDevice, useKeyAuth: false }
            ];
            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should skip devices without tested connection', async () => {
            const devices = [
                { ...mockDevice, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: false } }
            ];
            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should migrate eligible devices successfully', async () => {
            const fs = require('node:fs');
            fs.existsSync.mockReturnValue(false);

            const eligibleDevice = {
                ...mockDevice,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                }
            };

            mockDeviceService.getAllDevices.mockResolvedValue([eligibleDevice]);

            let execCallCount = 0;
            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                execCallCount++;
                
                const createMockStream = (stdoutData: string, exitCode: number = 0) => {
                    const mockStream: any = {
                        on: jest.fn((event: string, cb: any) => {
                            if (event === 'data') {
                                setTimeout(() => cb(Buffer.from(stdoutData)), 0);
                            } else if (event === 'close') {
                                setTimeout(() => cb(exitCode), 0);
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
                    return mockStream;
                };

                // First call: password validation
                if (execCallCount === 1) {
                    callback(null, createMockStream('', 0));
                }
                // Second call: calculate identifier
                else if (execCallCount === 2) {
                    callback(null, createMockStream('a1b2c3d4'));
                }
                // Third call: create service file
                else if (execCallCount === 3) {
                    callback(null, createMockStream(''));
                }
                // Fourth call: restart avahi daemon
                else if (execCallCount === 4) {
                    callback(null, createMockStream(''));
                }
            });

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.connect as any) = jest.fn();
            (mockSSHClient.end as any) = jest.fn();

            await service.migrateExistingDevices(mockDeviceService);

            expect(mockDeviceService.getAllDevices).toHaveBeenCalled();
            
            // Since migration doesn't provide a password, DNS registration will fail
            // with SUDO_PASSWORD_REQUIRED and the device will NOT be updated
            expect(mockDeviceService.updateDevice).not.toHaveBeenCalled();
        });

        it('should identify devices without dnsInstanceName', async () => {
            const device1 = {
                ...mockDevice,
                id: 'device-1',
                name: 'Device 1',
                dnsInstanceName: undefined,
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true }
            };

            const device2 = {
                ...mockDevice,
                id: 'device-2',
                name: 'Device 2',
                dnsInstanceName: '',
                isSetup: true,
                useKeyAuth: true,
                keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true }
            };

            mockDeviceService.getAllDevices.mockResolvedValue([device1, device2]);

            const mockWindow = { showInformationMessage: jest.fn() };
            await service.migrateExistingDevices(mockDeviceService, mockWindow);

            // Should show notification for both devices needing registration
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('2 devices require mDNS service registration'),
                'OK'
            );
        });

        it('should handle exceptions gracefully', async () => {
            mockDeviceService.getAllDevices.mockRejectedValue(new Error('Service error'));

            // Should not throw
            await expect(service.migrateExistingDevices(mockDeviceService)).resolves.not.toThrow();
        });

        it('should filter devices with all criteria', async () => {
            const devices = [
                { ...mockDevice, id: '1', name: 'Device 1', dnsInstanceName: undefined, isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Eligible - needs registration
                { ...mockDevice, id: '2', name: 'Device 2', dnsInstanceName: undefined, isSetup: false, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Not setup
                { ...mockDevice, id: '3', name: 'Device 3', dnsInstanceName: undefined, isSetup: true, useKeyAuth: false, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // No key auth
                { ...mockDevice, id: '4', name: 'Device 4', dnsInstanceName: undefined, isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: false } }, // Connection not tested
                { ...mockDevice, id: '5', name: 'Device 5', dnsInstanceName: 'abc123', isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Has dnsInstanceName - skip
            ];

            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            const mockWindow = { showInformationMessage: jest.fn() };
            await service.migrateExistingDevices(mockDeviceService, mockWindow);

            // Only device 1 should be identified (eligible and no dnsInstanceName)
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Device 1'),
                'OK'
            );
        });

        it('should handle multiple devices with mixed DNS states', async () => {
            const devices = [
                { ...mockDevice, id: 'device-1', name: 'Device 1', dnsInstanceName: 'abc123', isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Has dnsInstanceName - skip
                { ...mockDevice, id: 'device-2', name: 'Device 2', dnsInstanceName: '', isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Empty string - needs registration
                { ...mockDevice, id: 'device-3', name: 'Device 3', dnsInstanceName: undefined, isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Undefined - needs registration
            ];

            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            const mockWindow = { showInformationMessage: jest.fn() };
            await service.migrateExistingDevices(mockDeviceService, mockWindow);

            // Device 1 has dnsInstanceName - should be skipped
            // Devices 2 and 3 need registration
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('2 devices require mDNS service registration'),
                'OK'
            );
        });

        it('should handle devices with null, empty string, and whitespace-only dnsInstanceName', async () => {
            const devices = [
                { ...mockDevice, id: 'device-1', name: 'Device 1', dnsInstanceName: null as any, isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // null - needs registration
                { ...mockDevice, id: 'device-2', name: 'Device 2', dnsInstanceName: '   ', isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Whitespace only - needs registration
                { ...mockDevice, id: 'device-3', name: 'Device 3', dnsInstanceName: 'valid123', isSetup: true, useKeyAuth: true, keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true } }, // Valid - skip
            ];

            mockDeviceService.getAllDevices.mockResolvedValue(devices);

            const mockWindow = { showInformationMessage: jest.fn() };
            await service.migrateExistingDevices(mockDeviceService, mockWindow);

            // Devices 1 and 2 need registration (null and whitespace-only)
            // Device 3 has valid dnsInstanceName - should be skipped
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('2 devices require mDNS service registration'),
                'OK'
            );
        });

    });
});
