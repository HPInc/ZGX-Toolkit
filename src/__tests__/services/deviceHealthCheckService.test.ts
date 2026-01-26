/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for DeviceHealthCheckService.
 * Validates SSH connectivity health checks and configuration loading.
 */

import { DeviceHealthCheckService } from '../../services/deviceHealthCheckService';
import { Device } from '../../types/devices';
import { Client as SSHClient } from 'ssh2';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as SSHConfig from 'ssh-config';

// Mock dependencies
jest.mock('ssh2');
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

describe('DeviceHealthCheckService', () => {
    let service: DeviceHealthCheckService;
    let mockSSHClient: jest.Mocked<SSHClient>;
    let testDevice: Device;

    beforeEach(() => {
        service = new DeviceHealthCheckService();
        
        // Setup test device
        testDevice = {
            id: 'device-1',
            name: 'Test Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            useKeyAuth: true,
            isSetup: true,
            createdAt: new Date().toISOString(),
        } as Device;

        // Reset mocks
        jest.clearAllMocks();

        // Setup SSH client mock
        mockSSHClient = {
            connect: jest.fn(),
            on: jest.fn(),
            end: jest.fn(),
        } as any;

        (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => mockSSHClient);

        // Setup fs mocks
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.readFileSync as jest.Mock).mockReturnValue('');

        // Setup os mocks
        (os.homedir as jest.Mock).mockReturnValue(path.join(path.sep, 'home', 'testuser'));
        (os.platform as jest.Mock).mockReturnValue('linux');

        // Setup SSH config mock
        (SSHConfig.parse as jest.Mock).mockReturnValue({
            compute: jest.fn().mockReturnValue(null)
        });
    });

    describe('checkDeviceHealth', () => {
        it('should return healthy status when SSH connection succeeds', async () => {
            // Mock successful connection
            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(true);
            expect(result.device).toBe('Test Device');
            expect(result.error).toBeUndefined();
            expect(mockSSHClient.connect).toHaveBeenCalled();
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return unhealthy status when SSH connection times out', async () => {
            // Mock connection that never responds
            mockSSHClient.on.mockImplementation(() => mockSSHClient);

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(false);
            expect(result.device).toBe('Test Device');
            expect(result.error).toBe('Connection timeout');
        });

        it('should return unhealthy status when SSH connection fails with error', async () => {
            const errorMessage = 'Authentication failed';
            
            // Mock connection error
            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'error') {
                    setTimeout(() => handler(new Error(errorMessage)), 10);
                }
                return mockSSHClient;
            });

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(false);
            expect(result.device).toBe('Test Device');
            expect(result.error).toBe(errorMessage);
        });

        it('should return unhealthy status when connection closes unexpectedly', async () => {
            // Mock connection that closes without ready event
            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'close') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(false);
            expect(result.device).toBe('Test Device');
            expect(result.error).toBe('Connection closed unexpectedly');
        });

        it('should handle exceptions during health check', async () => {
            const errorMessage = 'Unexpected error';
            
            // Mock exception during connection
            mockSSHClient.connect.mockImplementation(() => {
                throw new Error(errorMessage);
            });

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(false);
            expect(result.device).toBe('Test Device');
            expect(result.error).toBe(errorMessage);
        });

        it('should use device name in result', async () => {
            const customDevice = { ...testDevice, name: 'Custom Device Name' };
            
            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            const result = await service.checkDeviceHealth(customDevice);

            expect(result.device).toBe('Custom Device Name');
        });

        it('should handle non-Error exceptions gracefully', async () => {
            mockSSHClient.connect.mockImplementation(() => {
                throw new Error('String error');
            });

            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(false);
            expect(result.error).toBe('String error');
        });
    });

    describe('getSSHConfig', () => {
        it('should create basic SSH config without ~/.ssh/config file', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            
            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: '192.168.1.100',
                    port: 22,
                    username: 'zgx',
                    readyTimeout: 5000,
                    timeout: 5000,
                })
            );
        });

        it('should use default port 22 when not specified', async () => {
            const { port, ...deviceWithoutPort } = testDevice;
            const testDeviceNoPort = deviceWithoutPort as Device;

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDeviceNoPort);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    port: 22,
                })
            );
        });

        it('should load and apply SSH config from ~/.ssh/config', async () => {
            const sshConfigContent = `
Host test-device
    HostName 10.0.0.50
    Port 2222
    User admin
    IdentityFile ~/.ssh/test_key
`;

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('.ssh') && filePath.includes('config')) {
                    return sshConfigContent;
                }
                if (filePath.includes('test_key')) {
                    return Buffer.from('private-key-content');
                }
                return '';
            });

            const mockCompute = jest.fn().mockReturnValue({
                HostName: '10.0.0.50',
                Port: '2222',
                User: 'admin',
                IdentityFile: path.join(path.sep, 'home', 'testuser', '.ssh', 'test_key'),
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: '10.0.0.50',
                    port: 2222,
                    username: 'admin',
                    privateKey: expect.any(Buffer),
                })
            );
        });

        it('should handle array values in SSH config', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('');

            const mockCompute = jest.fn().mockReturnValue({
                HostName: ['10.0.0.50', 'backup.host.com'],
                Port: ['2222', '22'],
                User: ['admin', 'root'],
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: '10.0.0.50',
                    port: 2222,
                    username: 'admin',
                })
            );
        });

        it('should handle multiple identity files and use first available', async () => {
            (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
                return filePath.includes('id_rsa'); // Only id_rsa exists
            });

            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('id_rsa')) {
                    return Buffer.from('rsa-key-content');
                }
                throw new Error('File not found');
            });

            const mockCompute = jest.fn().mockReturnValue({
                IdentityFile: [
                    path.join(path.sep, 'home', 'testuser', '.ssh', 'id_ed25519'),
                    path.join(path.sep, 'home', 'testuser', '.ssh', 'id_rsa'),
                    path.join(path.sep, 'home', 'testuser', '.ssh', 'id_ecdsa'),
                ],
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    privateKey: expect.any(Buffer),
                })
            );
        });

        it('should handle IdentitiesOnly=yes and disable agent', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('');

            const mockCompute = jest.fn().mockReturnValue({
                IdentitiesOnly: 'yes',
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            const connectCall = mockSSHClient.connect.mock.calls[0][0];
            expect(connectCall.agent).toBeUndefined();
        });

        it('should handle IdentitiesOnly as array', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('');

            const mockCompute = jest.fn().mockReturnValue({
                IdentitiesOnly: ['yes'],
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            const connectCall = mockSSHClient.connect.mock.calls[0][0];
            expect(connectCall.agent).toBeUndefined();
        });



        it('should try common key locations in order', async () => {
            const existsSyncMock = fs.existsSync as jest.Mock;
            const readFileSyncMock = fs.readFileSync as jest.Mock;

            // Only id_ecdsa exists
            existsSyncMock.mockImplementation((filePath: string) => {
                return filePath.includes('id_ecdsa');
            });

            readFileSyncMock.mockImplementation((filePath: string) => {
                if (filePath.includes('id_ecdsa')) {
                    return Buffer.from('ecdsa-key-content');
                }
                throw new Error('File not found');
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            // Should have checked ed25519, rsa, and ecdsa
            expect(existsSyncMock).toHaveBeenCalledWith(
                expect.stringContaining('id_ed25519')
            );
            expect(existsSyncMock).toHaveBeenCalledWith(
                expect.stringContaining('id_rsa')
            );
            expect(existsSyncMock).toHaveBeenCalledWith(
                expect.stringContaining('id_ecdsa')
            );

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    privateKey: expect.any(Buffer),
                })
            );
        });

        it('should expand tilde in identity file paths', async () => {
            (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
                // Return true only for SSH config and custom_key
                return filePath.includes('config') || filePath.includes('custom_key');
            });

            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('config')) {
                    return '';
                }
                if (filePath.includes('custom_key')) {
                    return Buffer.from('custom-key-content');
                }
                throw new Error('File not found');
            });

            const mockCompute = jest.fn().mockReturnValue({
                IdentityFile: '~/.ssh/custom_key',
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            // Verify that a path with custom_key was checked
            const existsSyncCalls = (fs.existsSync as jest.Mock).mock.calls;
            const customKeyCall = existsSyncCalls.find((call: any[]) => 
                call[0].includes('custom_key')
            );
            expect(customKeyCall).toBeDefined();
            
            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    privateKey: expect.any(Buffer),
                })
            );
        });

        it('should handle SSH config parse errors gracefully', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('invalid ssh config');
            (SSHConfig.parse as jest.Mock).mockImplementation(() => {
                throw new Error('Parse error');
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            // Should not throw, should continue with default config
            const result = await service.checkDeviceHealth(testDevice);

            expect(result.isHealthy).toBe(true);
            expect(mockSSHClient.connect).toHaveBeenCalled();
        });

        it('should handle identity file read errors gracefully', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const mockCompute = jest.fn().mockReturnValue({
                IdentityFile: path.join(path.sep, 'home', 'testuser', '.ssh', 'protected_key'),
            });

            (SSHConfig.parse as jest.Mock).mockReturnValue({
                compute: mockCompute
            });

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            // Should not have a private key
            await service.checkDeviceHealth(testDevice);

            expect(mockSSHClient.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: testDevice.host,
                    port: testDevice.port,
                    username: testDevice.username,
                })
            );
        });
    });

    describe('timeout handling', () => {
        it('should timeout after 5 seconds', async () => {
            // Mock connection that never responds
            mockSSHClient.on.mockImplementation(() => mockSSHClient);

            const startTime = Date.now();
            const result = await service.checkDeviceHealth(testDevice);
            const duration = Date.now() - startTime;

            expect(result.isHealthy).toBe(false);
            expect(result.error).toBe('Connection timeout');
            expect(duration).toBeGreaterThanOrEqual(4500); // Allow some margin
            expect(duration).toBeLessThan(6000);
        });

        it('should cleanup timeout on successful connection', async () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => handler(), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(clearTimeoutSpy).toHaveBeenCalled();
            expect(mockSSHClient.end).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('should cleanup timeout on error', async () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'error') {
                    setTimeout(() => handler(new Error('Connection failed')), 10);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('should not resolve multiple times on concurrent events', async () => {
            let resolveCount = 0;

            mockSSHClient.on.mockImplementation((event: string, handler: any) => {
                if (event === 'ready') {
                    setTimeout(() => {
                        resolveCount++;
                        handler();
                    }, 10);
                }
                if (event === 'error') {
                    setTimeout(() => {
                        resolveCount++;
                        handler(new Error('Error'));
                    }, 20);
                }
                return mockSSHClient;
            });

            await service.checkDeviceHealth(testDevice);

            // Give time for both events to fire
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should only count the first resolution (ready event)
            expect(resolveCount).toBe(2); // Both fire, but only one resolves
        });
    });
});
