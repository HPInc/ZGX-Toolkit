/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ConnectionService } from "../../services";
import { Device } from "../../types";
import * as path from 'path';
import { EventEmitter } from 'events';
import * as os from 'os'; // NOSONAR S4731

jest.mock('node:child_process', () => ({
    spawn: jest.fn(),
}));

const { spawn: spawnMock } = require('node:child_process');

// Mock the DNS service registration module
jest.mock('../../services/dnsRegistrationService', () => ({
    dnsServiceRegistration: {
        registerDNSService: jest.fn(),
        checkServiceFileExists: jest.fn(),
        validatePassword: jest.fn()
    },
    RegistrationErrorType: {
        NONE: 'none',
        SSH_CONNECTION_FAILED: 'ssh_connection_failed',
        FILE_CHECK_FAILED: 'file_check_failed',
        IDENTIFIER_CALCULATION_FAILED: 'identifier_calculation_failed',
        SERVICE_FILE_CREATION_FAILED: 'service_file_creation_failed',
        AVAHI_RESTART_FAILED: 'avahi_restart_failed',
        UNKNOWN_ERROR: 'unknown_error'
    }
}));

// Import the mocked DNS service at the top level
const { dnsServiceRegistration } = require('../../services/dnsRegistrationService');

describe('_ensureSSHConfigEntry', () => {
    let service: ConnectionService;
    let fsMock: any;
    let testDevice: Device;
    let alias: string;

    beforeEach(() => {
        fsMock = require('fs');

        testDevice = {
            id: 'm1',
            name: 'AliasMachine',
            host: '10.0.0.5',
            username: 'aliasuser',
            port: 33556,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true,
            },
            createdAt: new Date().toISOString(),
        };

        alias = `zgx-10.0.0.5-33556`;

        fsMock.readFileSync.mockReset();
        fsMock.writeFileSync.mockReset();
        fsMock.existsSync.mockImplementation((p: string) => {
            if (p.endsWith(`${path.sep}.ssh`)) return true;
            if (p.endsWith(`${path.sep}.ssh${path.sep}config`)) return true;
            return false;
        });

        service = new ConnectionService();
    });

    function written(): string {
        const call = fsMock.writeFileSync.mock.calls[0];
        return call ? call[1] : '';
    }

    function expectedBlock(m: Device, a: string): string {
        const newBlockLines = [
            `Host ${a}`,
            `  HostName ${m.host}`,
            `  User ${m.username}`,
            `  Port ${m.port}`,
            `  StrictHostKeyChecking ask`,
            ''
        ];
        return newBlockLines.join('\n');
    }

    it('appends alias block when config empty', async () => {
        fsMock.readFileSync.mockReturnValue('');

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
        const cfg = written();
        const block = expectedBlock(testDevice, alias);
        expect(cfg).toBe(block); // exactly just the new block
        expect(cfg.endsWith('\n')).toBe(true);
    });

    it('skips append when alias already exists', async () => {
        const existing = expectedBlock(testDevice, alias);
        fsMock.readFileSync.mockReturnValue(existing);

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    it('prepends newline when existing content lacks trailing newline', async () => {
        const existingLines = [
            'Host other',
            '  HostName 1.2.3.4',
            '  User someone',
            '  Port 22'
        ];
        const existing = existingLines.join('\n'); // no trailing newline
        fsMock.readFileSync.mockReturnValue(existing);

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        const cfg = written();
        const block = expectedBlock(testDevice, alias);
        // Existing + newline + block
        expect(cfg).toBe(existing + '\n' + block);
    });

    it('does not prepend extra newline when existing ends with newline', async () => {
        const existingLines = [
            'Host other',
            '  HostName 1.2.3.4',
            '  User someone',
            '  Port 22',
            ''
        ];
        const existing = existingLines.join('\n'); // already ends with newline
        fsMock.readFileSync.mockReturnValue(existing);

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        const cfg = written();
        const block = expectedBlock(testDevice, alias);
        expect(cfg).toBe(existing + block); // no extra blank line inserted
    });

    it('is idempotent: second call produces no additional write', async () => {
        fsMock.readFileSync.mockReturnValue('');
        await (service as any).ensureSSHConfigEntry(alias, testDevice);
        const firstWrite = written();

        fsMock.writeFileSync.mockClear();
        fsMock.readFileSync.mockReturnValue(firstWrite);

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        expect(fsMock.writeFileSync).not.toHaveBeenCalled();
        expect(firstWrite).toBe(expectedBlock(testDevice, alias));
    });

    it('does not alter unrelated existing entries', async () => {
        const otherBlockLines = [
            'Host other-host',
            '  HostName 8.8.8.8',
            '  User nobody',
            '  Port 22',
            ''
        ];
        const existing = otherBlockLines.join('\n');
        fsMock.readFileSync.mockReturnValue(existing);

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        const cfg = written();
        const block = expectedBlock(testDevice, alias);
        expect(cfg).toBe(existing + block);
        expect(cfg).toContain('Host other-host');
        expect(cfg).toContain(`Host ${alias}`);
    });
});

describe('registerDNSServiceWithAvahi', () => {
    let service: ConnectionService;
    let testDevice: Device;

    beforeEach(() => {
        // Reset the mock before each test
        jest.clearAllMocks();

        testDevice = {
            id: 'test-device',
            name: 'TestDevice',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true,
            },
            createdAt: new Date().toISOString(),
        };

        service = new ConnectionService();
    });

    it('should successfully register DNS service', async () => {
        const mockResult = {
            success: true,
            deviceIdentifier: 'a1b2c3d4',
            alreadyRegistered: false,
            errorType: 'none',
            message: undefined
        };

        dnsServiceRegistration.registerDNSService.mockResolvedValue(mockResult);

        const result = await service.registerDNSServiceWithAvahi(testDevice, 'test-password');

        expect(dnsServiceRegistration.registerDNSService).toHaveBeenCalledWith(testDevice, 'test-password');
        expect(result.success).toBe(true);
        expect(result.deviceIdentifier).toBe('a1b2c3d4');
        expect(result.alreadyRegistered).toBe(false);
    });

    it('should handle already registered service', async () => {
        const mockResult = {
            success: true,
            alreadyRegistered: true,
            errorType: 'none',
            message: undefined
        };

        dnsServiceRegistration.registerDNSService.mockResolvedValue(mockResult);

        const result = await service.registerDNSServiceWithAvahi(testDevice, 'test-password');

        expect(dnsServiceRegistration.registerDNSService).toHaveBeenCalledWith(testDevice, 'test-password');
        expect(result.success).toBe(true);
        expect(result.alreadyRegistered).toBe(true);
    });

    it('should handle registration failure', async () => {
        const mockResult = {
            success: false,
            alreadyRegistered: false,
            errorType: 'ssh_connection_failed',
            message: 'SSH connection failed: ECONNREFUSED'
        };

        dnsServiceRegistration.registerDNSService.mockResolvedValue(mockResult);

        const result = await service.registerDNSServiceWithAvahi(testDevice, 'test-password');

        expect(dnsServiceRegistration.registerDNSService).toHaveBeenCalledWith(testDevice, 'test-password');
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ssh_connection_failed');
        expect(result.message).toContain('ECONNREFUSED');
    });

    it('should handle exceptions from DNS service', async () => {
        const error = new Error('Unexpected error during registration');
        dnsServiceRegistration.registerDNSService.mockRejectedValue(error);

        const result = await service.registerDNSServiceWithAvahi(testDevice, 'test-password');

        expect(dnsServiceRegistration.registerDNSService).toHaveBeenCalledWith(testDevice, 'test-password');
        expect(result.success).toBe(false);
        expect(result.alreadyRegistered).toBe(false);
        expect(result.message).toBe('Unexpected error during registration');
    });

    it('should handle non-Error exceptions', async () => {
        dnsServiceRegistration.registerDNSService.mockRejectedValue('String error');

        const result = await service.registerDNSServiceWithAvahi(testDevice, 'test-password');

        expect(dnsServiceRegistration.registerDNSService).toHaveBeenCalledWith(testDevice, 'test-password');
        expect(result.success).toBe(false);
        expect(result.message).toBe('String error');
    });
});

describe('checkDNSServiceFileExists', () => {
    let service: ConnectionService;
    let testDevice: Device;

    beforeEach(() => {
        service = new ConnectionService();
        testDevice = {
            id: 'test-device-1',
            name: 'Test Device',
            host: '192.168.1.100',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: new Date().toISOString(),
        };
        
        jest.clearAllMocks();
    });

    it('should return exists: true when file exists', async () => {
        dnsServiceRegistration.checkServiceFileExists.mockResolvedValue({
                exists: true
            });

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return exists: false when file does not exist', async () => {
            dnsServiceRegistration.checkServiceFileExists.mockResolvedValue({
                exists: false
            });

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(false);
        });

        it('should return exists: false with error when check fails', async () => {
            dnsServiceRegistration.checkServiceFileExists.mockResolvedValue({
                exists: false,
                error: 'Permission denied'
            });

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(false);
            expect(result.error).toBe('Permission denied');
        });

        it('should handle exceptions and return exists: false with error', async () => {
            const error = new Error('SSH connection failed');
            dnsServiceRegistration.checkServiceFileExists.mockRejectedValue(error);

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(false);
            expect(result.error).toBe('SSH connection failed');
        });

        it('should handle non-Error exceptions', async () => {
            dnsServiceRegistration.checkServiceFileExists.mockRejectedValue('String error');

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(false);
            expect(result.error).toBe('String error');
        });

        it('should handle connection errors with isConnectionError flag', async () => {
            dnsServiceRegistration.checkServiceFileExists.mockResolvedValue({
                exists: false,
                error: 'Connection timeout',
                isConnectionError: true
            });

            const result = await service.checkDNSServiceFileExists(testDevice);

            expect(dnsServiceRegistration.checkServiceFileExists).toHaveBeenCalledWith(testDevice);
            expect(result.exists).toBe(false);
            expect(result.error).toBe('Connection timeout');
        });
});

describe('validatePasswordForDNS', () => {
    let service: ConnectionService;
    let testDevice: Device;

    beforeEach(() => {
        service = new ConnectionService();
        testDevice = {
            id: 'test-device-1',
            name: 'Test Device',
            host: '192.168.1.100',
            username: 'root',
            port: 22,
            isSetup: true,
            useKeyAuth: true,
            keySetup: {
                keyGenerated: true,
                keyCopied: true,
                connectionTested: true
            },
            createdAt: new Date().toISOString(),
        };
        
        jest.clearAllMocks();
    });

    it('should return valid: true for correct password', async () => {
        dnsServiceRegistration.validatePassword.mockResolvedValue({
            valid: true,
            isConnectionError: false
        });

        const result = await service.validatePasswordForDNS(testDevice, 'correct-password');

        expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, 'correct-password');
        expect(result.valid).toBe(true);
        expect(result.isConnectionError).toBe(false);
    });

        it('should return valid: false for incorrect password', async () => {
            dnsServiceRegistration.validatePassword.mockResolvedValue({
                valid: false,
                isConnectionError: false,
                error: 'Incorrect password'
            });            const result = await service.validatePasswordForDNS(testDevice, 'wrong-password');

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, 'wrong-password');
            expect(result.valid).toBe(false);
            expect(result.isConnectionError).toBe(false);
            expect(result.error).toBe('Incorrect password');
        });

        it('should return isConnectionError: true for connection failures', async () => {
            dnsServiceRegistration.validatePassword.mockResolvedValue({
                valid: false,
                isConnectionError: true,
                error: 'Connection timeout'
            });

            const result = await service.validatePasswordForDNS(testDevice, 'test-password');

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, 'test-password');
            expect(result.valid).toBe(false);
            expect(result.isConnectionError).toBe(true);
            expect(result.error).toBe('Connection timeout');
        });

        it('should handle exceptions and return connection error', async () => {
            const error = new Error('SSH connection lost');
            dnsServiceRegistration.validatePassword.mockRejectedValue(error);

            const result = await service.validatePasswordForDNS(testDevice, 'test-password');

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, 'test-password');
            expect(result.valid).toBe(false);
            expect(result.isConnectionError).toBe(true);
            expect(result.error).toBe('SSH connection lost');
        });

        it('should handle non-Error exceptions', async () => {
            dnsServiceRegistration.validatePassword.mockRejectedValue('Network error');

            const result = await service.validatePasswordForDNS(testDevice, 'test-password');

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, 'test-password');
            expect(result.valid).toBe(false);
            expect(result.isConnectionError).toBe(true);
            expect(result.error).toBe('Network error');
        });

        it('should handle empty password', async () => {
            dnsServiceRegistration.validatePassword.mockResolvedValue({
                valid: false,
                isConnectionError: false,
                error: 'Password required'
            });

            const result = await service.validatePasswordForDNS(testDevice, '');

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, '');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Password required');
        });

        it('should handle special characters in password', async () => {
            const specialPassword = 'p@$$w0rd!#$%';
            dnsServiceRegistration.validatePassword.mockResolvedValue({
                valid: true,
                isConnectionError: false
            });

            const result = await service.validatePasswordForDNS(testDevice, specialPassword);

            expect(dnsServiceRegistration.validatePassword).toHaveBeenCalledWith(testDevice, specialPassword);
            expect(result.valid).toBe(true);
            expect(result.isConnectionError).toBe(false);
        });
});

describe('testSSHKeyConnectivity', () => {
    let service: ConnectionService;
    let fsMock: any;
    let mockProcess: any;

    const testDevice: Device = {
        id: 'conn-1',
        name: 'ConnDevice',
        host: '192.168.1.50', // NOSONAR S1313
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: { keyGenerated: true, keyCopied: true, connectionTested: false },
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        fsMock = require('fs'); // NOSONAR S4731
        jest.clearAllMocks();

        // Make the trusted binary appear to exist on the current platform
        fsMock.existsSync.mockImplementation((p: string) =>
            p.includes('OpenSSH') || p.includes('/usr/bin/ssh') || p.includes('/bin/ssh')
        );

        // Minimal mock child process — just needs EventEmitter interface + kill
        mockProcess = new EventEmitter() as any;
        mockProcess.exitCode = null;
        mockProcess.signalCode = null;
        mockProcess.kill = jest.fn();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();

        spawnMock.mockReturnValue(mockProcess);

        service = new ConnectionService();
    });

    it('resolves true when SSH exits with code 0', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        expect(await promise).toBe(true);
    });

    it('resolves false when SSH exits with non-zero code', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 255, null);
        expect(await promise).toBe(false);
    });

    it('resolves false on spawn error event', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('error', new Error('ECONNREFUSED'));
        expect(await promise).toBe(false);
    });

    it('includes -n flag in SSH args (stdin regression guard)', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        await promise;
        const args: string[] = spawnMock.mock.calls[0][1];
        expect(args).toContain('-n');
    });

    it('includes -T flag in SSH args', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        await promise;
        const args: string[] = spawnMock.mock.calls[0][1];
        expect(args).toContain('-T');
    });

    it('spawns with stdin set to ignore', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        await promise;
        const options = spawnMock.mock.calls[0][2];
        expect(options.stdio[0]).toBe('ignore');
    });

    it('spawns an absolute trusted binary path, not bare "ssh"', async () => {
        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        await promise;
        const binaryPath: string = spawnMock.mock.calls[0][0];
        expect(path.isAbsolute(binaryPath)).toBe(true);
        expect(binaryPath).not.toBe('ssh');
    });

    it('includes -p and port for non-standard port', async () => {
        const deviceWithPort = { ...testDevice, port: 33556 };
        const promise = service.testSSHKeyConnectivity(deviceWithPort);
        mockProcess.emit('close', 0, null);
        await promise;
        const args: string[] = spawnMock.mock.calls[0][1];
        expect(args).toContain('-p');
        expect(args).toContain('33556');
    });

    it('resolves false and kills process on timeout', async () => {
        jest.useFakeTimers();
        const promise = service.testSSHKeyConnectivity(testDevice, 5000);
        jest.advanceTimersByTime(5001);
        expect(await promise).toBe(false);
        expect(mockProcess.kill).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('resolves false without spawning when trusted binary is not found', async () => {
        fsMock.existsSync.mockReturnValue(false); // no binary at any candidate path
        const result = await service.testSSHKeyConnectivity(testDevice);
        expect(result).toBe(false);
        expect(spawnMock).not.toHaveBeenCalled();
    });

    it('handles existsSync throwing during binary resolution', async () => {
        fsMock.existsSync.mockImplementation(() => { throw new Error('permission denied'); });
        const result = await service.testSSHKeyConnectivity(testDevice);
        expect(result).toBe(false);
        expect(spawnMock).not.toHaveBeenCalled();
    });
    
    it('falls back to /bin/ssh when /usr/bin/ssh does not exist', async () => {
        const platformSpy = jest.spyOn(os, 'platform').mockReturnValue('linux');

        fsMock.existsSync.mockImplementation((p: string) =>
            p.includes('/bin/ssh') && !p.includes('/usr/bin/ssh')
        );

        const promise = service.testSSHKeyConnectivity(testDevice);
        mockProcess.emit('close', 0, null);
        await promise;

        const binaryPath: string = spawnMock.mock.calls[0][0];
        expect(binaryPath).toContain('/bin/ssh');
        expect(binaryPath).not.toContain('/usr/bin/ssh');

        platformSpy.mockRestore();
    });
});

describe('getTrustedBinaryCandidates', () => {
    let service: ConnectionService;

    beforeEach(() => {
        service = new ConnectionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns a path under System32/OpenSSH on win32', () => {
        jest.spyOn(os, 'platform').mockReturnValue('win32');
        const candidates: string[] = (service as any).getTrustedBinaryCandidates('ssh');
        expect(candidates.some((c: string) => c.includes('OpenSSH') && c.endsWith('ssh.exe'))).toBe(true);
    });

    it('returns /usr/bin/ssh on darwin', () => {
        jest.spyOn(os, 'platform').mockReturnValue('darwin');
        const candidates: string[] = (service as any).getTrustedBinaryCandidates('ssh');
        expect(candidates).toEqual(['/usr/bin/ssh']);
    });

    it('returns two candidates on linux', () => {
        jest.spyOn(os, 'platform').mockReturnValue('linux');
        const candidates: string[] = (service as any).getTrustedBinaryCandidates('ssh');
        expect(candidates).toContain('/usr/bin/ssh');
        expect(candidates).toContain('/bin/ssh');
    });
});

describe('generateManualSetupCommands', () => {
    let service: ConnectionService;

    const testDevice: Device = {
        id: 'manual-1',
        name: 'ManualDevice',
        host: '192.168.1.60',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: {
            keyGenerated: false,
            keyCopied: false,
            connectionTested: false,
        },
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
    });

    it('uses ed25519 key type for manual key generation across platforms', () => {
        const commands = service.generateManualSetupCommands(testDevice);

        expect(commands.windows.keyGen).toContain('ssh-keygen -t ed25519');
        expect(commands.linux.keyGen).toContain('ssh-keygen -t ed25519');
        expect(commands.mac.keyGen).toContain('ssh-keygen -t ed25519');
    });

    it('does not regress to rsa in manual key generation commands', () => {
        const commands = service.generateManualSetupCommands(testDevice);

        expect(commands.windows.keyGen.toLowerCase()).not.toContain('rsa');
        expect(commands.linux.keyGen.toLowerCase()).not.toContain('rsa');
        expect(commands.mac.keyGen.toLowerCase()).not.toContain('rsa');
    });
});
