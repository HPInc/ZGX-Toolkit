/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for SSH configuration utility.
 * Validates SSH config parsing, credential resolution, and fallback mechanisms.
 */

import { getSSHConfig } from '../../utils/sshConfig';
import { Device } from '../../types/devices';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as SSHConfig from 'ssh-config';

// Mock dependencies
jest.mock('node:fs');
jest.mock('node:os');
jest.mock('ssh-config');

// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
}));

describe('sshConfig', () => {
    let mockDevice: Device;

    beforeEach(() => {
        jest.clearAllMocks();

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

        (os.homedir as jest.Mock).mockReturnValue('/home/testuser');
    });

    describe('getSSHConfig', () => {
        describe('Basic Configuration', () => {
            it('should create config with device properties when no SSH config file exists', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                const config = getSSHConfig(mockDevice);

                expect(config).toBeDefined();
                expect(config.host).toBe('192.168.1.100');
                expect(config.username).toBe('zgx');
                expect(config.port).toBe(22);
            });

            it('should use default port 22 when device port is undefined', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);
                const deviceWithoutPort = { ...mockDevice };
                delete (deviceWithoutPort as any).port;

                const config = getSSHConfig(deviceWithoutPort);

                expect(config.port).toBe(22);
            });

            it('should apply custom timeout options when provided', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                const config = getSSHConfig(mockDevice, {
                    timeout: 5000,
                    readyTimeout: 10000
                });

                expect(config.timeout).toBe(5000);
                expect(config.readyTimeout).toBe(10000);
            });

            it('should leave timeout options undefined when not provided', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                const config = getSSHConfig(mockDevice);

                expect(config.timeout).toBeUndefined();
                expect(config.readyTimeout).toBeUndefined();
            });
        });

        describe('SSH Config File Parsing', () => {
            it('should parse SSH config and apply HostName', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue(`
                    Host 192.168.1.100
                        HostName actual-host.example.com
                        User zgx
                `);

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        HostName: 'actual-host.example.com',
                        User: 'zgx'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.host).toBe('actual-host.example.com');
            });

            it('should handle HostName as array', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        HostName: ['host1.example.com', 'host2.example.com']
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.host).toBe('host1.example.com');
            });

            it('should parse and apply Port', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        Port: '2222'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.port).toBe(2222);
            });

            it('should handle Port as array', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        Port: ['2222', '22']
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.port).toBe(2222);
            });

            it('should parse and apply User', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        User: 'customuser'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.username).toBe('customuser');
            });

            it('should handle User as array', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        User: ['user1', 'user2']
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice);

                expect(config.username).toBe('user1');
            });

            it('should handle missing SSH config file gracefully', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });

            it('should handle SSH config parse errors gracefully', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('invalid config');
                (SSHConfig.parse as jest.Mock).mockImplementation(() => {
                    throw new Error('Parse error');
                });

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });
        });

        describe('IdentityFile Handling', () => {
            it('should handle missing IdentityFile gracefully', () => {
                (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) return true;
                    return false;
                });

                (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) {
                        return 'Host config content';
                    }
                    return Buffer.from('');
                });

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        IdentityFile: '/nonexistent/key'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });

            it('should handle IdentityFile read errors gracefully', () => {
                (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) return true;
                    if (path.includes('id_custom')) return true;
                    return false;
                });

                (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) {
                        return 'Host config content';
                    }
                    throw new Error('Permission denied');
                });

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        IdentityFile: '/home/testuser/.ssh/id_custom'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });
        });

        describe('IdentitiesOnly Handling', () => {


            it('should handle undefined IdentitiesOnly without crashing', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        User: 'zgx'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });

            it('should handle empty array IdentitiesOnly gracefully', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        IdentitiesOnly: []
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                expect(() => getSSHConfig(mockDevice)).not.toThrow();
            });
        });

        describe('Authentication Fallback', () => {
            it('should try common key locations when no key in SSH config', () => {
                (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) return false;
                    if (path.includes('id_ed25519')) return true;
                    return false;
                });

                (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('id_ed25519')) {
                        return Buffer.from('ed25519-key-data');
                    }
                    return Buffer.from('');
                });

                const config = getSSHConfig(mockDevice);

                expect(config.privateKey).toBeDefined();
            });

            it('should try id_rsa when id_ed25519 not found', () => {
                (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) return false;
                    if (path.includes('id_rsa')) return true;
                    return false;
                });

                (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('id_rsa')) {
                        return Buffer.from('rsa-key-data');
                    }
                    return Buffer.from('');
                });

                const config = getSSHConfig(mockDevice);

                expect(config.privateKey).toBeDefined();
            });

            it('should try id_ecdsa when other keys not found', () => {
                (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('.ssh/config')) return false;
                    if (path.includes('id_ecdsa')) return true;
                    return false;
                });

                (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                    if (path.includes('id_ecdsa')) {
                        return Buffer.from('ecdsa-key-data');
                    }
                    return Buffer.from('');
                });

                const config = getSSHConfig(mockDevice);

                expect(config.privateKey).toBeDefined();
            });


        });

        describe('Integration Scenarios', () => {
            it('should combine SSH config with timeout options', () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue('');

                const mockParsedConfig = {
                    compute: jest.fn().mockReturnValue({
                        HostName: 'configured-host.example.com',
                        Port: '2222',
                        User: 'configuser'
                    })
                };
                (SSHConfig.parse as jest.Mock).mockReturnValue(mockParsedConfig);

                const config = getSSHConfig(mockDevice, {
                    timeout: 5000,
                    readyTimeout: 10000
                });

                expect(config.host).toBe('configured-host.example.com');
                expect(config.port).toBe(2222);
                expect(config.username).toBe('configuser');
                expect(config.timeout).toBe(5000);
                expect(config.readyTimeout).toBe(10000);
            });
        });
    });
});
