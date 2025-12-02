/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppInstallationService } from '../../services/appInstallationService';
import { Device } from '../../types/devices';
import { Client as SSHClient } from 'ssh2';

jest.mock('ssh2');
jest.mock('fs');
jest.mock('../../utils/logger');

/**
 * Tests for AppInstallationService password authentication functionality.
 * 
 * This test suite validates:
 * 1. SSH config parsing handles missing/undefined fields gracefully
 * 2. Password validation occurs before install/uninstall operations
 * 3. Passwords are correctly passed to sudo commands via stdin
 */
describe('AppInstallationService - Password Authentication', () => {
    let service: AppInstallationService;
    let mockDevice: Device;
    let mockSSHClient: jest.Mocked<SSHClient>;

    beforeEach(() => {
        service = new AppInstallationService();
        
        mockDevice = {
            id: 'test-device-1',
            name: 'Test ZGX Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            isSetup: true,
            useKeyAuth: false, // Password auth
            keySetup: {
                keyGenerated: false,
                keyCopied: false,
                connectionTested: false
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

    describe('SSH Config Parsing', () => {
        it('should handle undefined IdentitiesOnly without crashing', () => {
            const fs = require('fs');
            
            // Mock SSH config without IdentitiesOnly
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(`
Host test-host
    HostName 192.168.1.100
    User zgx
    Port 22
`);

            // This should not throw "Cannot read properties of undefined (reading '0')"
            expect(() => {
                (service as any).getSSHConfig(mockDevice);
            }).not.toThrow();
        });

        it('should handle IdentitiesOnly as undefined gracefully', () => {
            const fs = require('fs');
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(`
Host 192.168.1.100
    HostName 192.168.1.100
    User zgx
`);

            const config = (service as any).getSSHConfig(mockDevice);
            
            // Should not crash and should return valid config
            expect(config).toBeDefined();
            expect(config.host).toBe('192.168.1.100');
            expect(config.username).toBe('zgx');
        });

        it('should handle missing SSH config file', () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            const config = (service as any).getSSHConfig(mockDevice);
            
            expect(config).toBeDefined();
            expect(config.host).toBe(mockDevice.host);
            expect(config.username).toBe(mockDevice.username);
        });
    });

    describe('Password Validation', () => {
        it('should require password for apps with sudo commands during uninstall', async () => {
            const result = await service.uninstallApplications(
                mockDevice,
                ['podman'],
                undefined,
                undefined
            );

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.message).toContain('password required');
        });

        it('should require password for apps with sudo commands during install', async () => {
            const result = await service.installApplications(
                mockDevice,
                ['podman'],
                jest.fn(),
                undefined
            );

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.message).toContain('password required');
        });

        it('should validate password before attempting uninstall', async () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
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
                        on: jest.fn().mockReturnThis(),
                    },
                    write: jest.fn(),
                    end: jest.fn(),
                };
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const validatePasswordSpy = jest.spyOn(service as any, 'validatePassword');

            await service.uninstallApplications(
                mockDevice,
                ['curl'],
                undefined,
                'test-password'
            );

            expect(validatePasswordSpy).toHaveBeenCalled();
        });

        it('should validate password before attempting install', async () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
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
                        on: jest.fn().mockReturnThis(),
                    },
                    write: jest.fn(),
                    end: jest.fn(),
                };
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const validatePasswordSpy = jest.spyOn(service as any, 'validatePassword');

            await service.installApplications(
                mockDevice,
                ['curl'],
                jest.fn(),
                'test-password'
            );

            expect(validatePasswordSpy).toHaveBeenCalled();
        });
    });

    describe('Password Handling in SSH Commands', () => {
        it('should pass password to sudo commands via stdin', async () => {
            const mockWrite = jest.fn();
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn().mockReturnThis(),
                },
                write: mockWrite,
                end: jest.fn(),
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const password = 'test-password';
            await (service as any).executeSSHCommand(
                mockDevice,
                'sudo -S whoami',
                'test-app',
                password,
                10
            );

            // Verify password was written to stdin
            expect(mockWrite).toHaveBeenCalledWith(
                password + '\n',
                expect.any(Function)
            );
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
                    on: jest.fn().mockReturnThis(),
                },
                write: mockWrite,
                end: jest.fn(),
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            await (service as any).executeSSHCommand(
                mockDevice,
                'echo "hello"',
                'test-app',
                'test-password',
                10
            );

            // Password should NOT be written for non-sudo commands
            expect(mockWrite).not.toHaveBeenCalled();
        });
    });


});
