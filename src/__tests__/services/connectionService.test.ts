/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ConnectionService } from '../../services';
import { Device } from '../../types';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import * as os from 'node:os'; // NOSONAR S4731
import * as vscode from 'vscode';

jest.mock('node:child_process', () => ({
    spawn: jest.fn()
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
                connectionTested: true
            },
            createdAt: new Date().toISOString()
        };

        alias = 'zgx-10.0.0.5-33556';

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
            '  StrictHostKeyChecking ask',
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

    it('creates the .ssh directory when it does not exist', async () => {
        fsMock.existsSync.mockReturnValue(false); // .ssh dir and config both missing
        fsMock.readFileSync.mockReturnValue('');

        await (service as any).ensureSSHConfigEntry(alias, testDevice);

        expect(fsMock.mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('.ssh'),
            { recursive: true, mode: 0o700 }
        );
        expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('logs and swallows the error when writing the config fails', async () => {
        fsMock.readFileSync.mockReturnValue('');
        fsMock.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });

        await expect((service as any).ensureSSHConfigEntry(alias, testDevice)).resolves.toBeUndefined();
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
                connectionTested: true
            },
            createdAt: new Date().toISOString()
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
            createdAt: new Date().toISOString()
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
            createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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

    it('logs a warning when killing the timed-out process itself throws', async () => {
        jest.useFakeTimers();
        mockProcess.kill.mockImplementation(() => { throw new Error('kill failed'); });

        const promise = service.testSSHKeyConnectivity(testDevice, 5000);
        jest.advanceTimersByTime(5001);

        expect(await promise).toBe(false);
        expect(mockProcess.kill).toHaveBeenCalled();
        jest.useRealTimers();
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

    it('falls back to C:\\Windows when windir is not set on win32', () => {
        jest.spyOn(os, 'platform').mockReturnValue('win32');
        const original = process.env.windir;
        delete process.env.windir;

        const candidates: string[] = (service as any).getTrustedBinaryCandidates('ssh');

        expect(candidates[0]).toContain(String.raw`C:\Windows`);

        if (original !== undefined) {
            process.env.windir = original;
        }
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

describe('spawnTrustedBinary', () => {
    let service: ConnectionService;
    let fsMock: any;

    beforeEach(() => {
        fsMock = require('fs');
        jest.clearAllMocks();
        service = new ConnectionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        // mockImplementation persists across tests since clearMocks/restoreAllMocks
        // do not reset custom implementations set on this auto-mocked 'fs' module.
        fsMock.existsSync.mockReset();
    });

    it('spawns without options when none are provided', () => {
        fsMock.existsSync.mockImplementation((p: string) => p.includes('ssh-keygen'));
        spawnMock.mockReturnValue(new EventEmitter());

        (service as any).spawnTrustedBinary('ssh-keygen', ['-t', 'ed25519']);

        expect(spawnMock).toHaveBeenCalledWith(expect.any(String), ['-t', 'ed25519']);
    });

    it('handles a non-Error thrown while probing a candidate path', () => {
        fsMock.existsSync.mockImplementation(() => { throw 'permission denied'; });

        expect(() => (service as any).resolveTrustedBinary('ssh')).toThrow(
            'Unable to locate a trusted ssh binary'
        );
    });

    it('rethrows a non-Error failure from resolveTrustedBinary', () => {
        jest.spyOn(service as any, 'resolveTrustedBinary').mockImplementation(() => {
            throw 'boom';
        });

        let thrown: any;
        try {
            (service as any).spawnTrustedBinary('ssh', []);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBe('boom');
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
            connectionTested: false
        },
        createdAt: new Date().toISOString()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        const fsMock: any = require('fs');
        fsMock.existsSync.mockReset();
        fsMock.existsSync.mockReturnValue(true);
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

describe('generateSSHKey', () => {
    let service: ConnectionService;
    let fsMock: any;
    let keygenProcess: any;

    const isKeyPath = (p: string) => p.endsWith(`${path.sep}.ssh${path.sep}id_ed25519`);
    const isSshDir = (p: string) => p.endsWith(`${path.sep}.ssh`);
    const isTrustedKeygenBinary = (p: string) => p.includes('ssh-keygen');

    beforeEach(() => {
        fsMock = require('fs');
        jest.clearAllMocks();

        keygenProcess = new EventEmitter() as any;
        keygenProcess.stdout = new EventEmitter();
        keygenProcess.stderr = new EventEmitter();
        spawnMock.mockReturnValue(keygenProcess);

        service = new ConnectionService();
    });

    it('returns existing key info without spawning ssh-keygen when key already exists', async () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue('ssh-ed25519 AAAATESTKEY comment\n');

        const result = await service.generateSSHKey();

        expect(spawnMock).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result?.publicKey).toBe('ssh-ed25519 AAAATESTKEY comment');
        expect(result?.keyPath).toContain('id_ed25519');
    });

    it('creates the .ssh directory and generates a key when neither exist', async () => {
        fsMock.existsSync.mockImplementation((p: string) => {
            if (isKeyPath(p)) return false;
            if (isSshDir(p)) return false;
            return isTrustedKeygenBinary(p);
        });
        fsMock.readFileSync.mockReturnValue('ssh-ed25519 NEWKEY comment\n');

        const promise = service.generateSSHKey();
        keygenProcess.emit('close', 0);
        const result = await promise;

        expect(fsMock.mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('.ssh'),
            { recursive: true, mode: 0o700 }
        );
        expect(spawnMock).toHaveBeenCalled();
        expect(result?.publicKey).toBe('ssh-ed25519 NEWKEY comment');
    });

    it('skips directory creation when .ssh already exists but the key does not', async () => {
        fsMock.existsSync.mockImplementation((p: string) => {
            if (isKeyPath(p)) return false;
            if (isSshDir(p)) return true;
            return isTrustedKeygenBinary(p);
        });
        fsMock.readFileSync.mockReturnValue('ssh-ed25519 NEWKEY comment\n');

        const promise = service.generateSSHKey();
        keygenProcess.emit('close', 0);
        await promise;

        expect(fsMock.mkdirSync).not.toHaveBeenCalled();
        expect(spawnMock).toHaveBeenCalled();
    });

    it('returns null and shows an error message when ssh-keygen exits non-zero', async () => {
        fsMock.existsSync.mockImplementation((p: string) => {
            if (isKeyPath(p)) return false;
            if (isSshDir(p)) return true;
            return isTrustedKeygenBinary(p);
        });

        const promise = service.generateSSHKey();
        keygenProcess.stderr.emit('data', Buffer.from('permission denied'));
        keygenProcess.emit('close', 1);
        const result = await promise;

        expect(result).toBeNull();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Failed to generate SSH key')
        );
    });

    it('returns null when the ssh-keygen process emits an error event', async () => {
        fsMock.existsSync.mockImplementation((p: string) => {
            if (isKeyPath(p)) return false;
            if (isSshDir(p)) return true;
            return isTrustedKeygenBinary(p);
        });

        const promise = service.generateSSHKey();
        keygenProcess.emit('error', new Error('spawn failed'));
        const result = await promise;

        expect(result).toBeNull();
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('returns null when no trusted ssh-keygen binary can be resolved', async () => {
        fsMock.existsSync.mockImplementation((p: string) => {
            if (isKeyPath(p)) return false;
            if (isSshDir(p)) return true;
            return false; // no trusted binary candidate exists
        });

        const result = await service.generateSSHKey();

        expect(spawnMock).not.toHaveBeenCalled();
        expect(result).toBeNull();
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('handles non-Error throws in the outer catch block', async () => {
        fsMock.existsSync.mockReturnValue(true); // key already exists, skip keygen
        fsMock.readFileSync.mockImplementation(() => { throw 'raw string failure'; });

        const result = await service.generateSSHKey();

        expect(result).toBeNull();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Unknown error')
        );
    });
});

describe('hasIDED25519Key', () => {
    let service: ConnectionService;
    let fsMock: any;

    beforeEach(() => {
        fsMock = require('fs');
        jest.clearAllMocks();
        service = new ConnectionService();
    });

    it('returns true when both the private and public key exist', () => {
        fsMock.existsSync.mockReturnValue(true);
        expect(service.hasIDED25519Key()).toBe(true);
    });

    it('returns false when the private key is missing', () => {
        fsMock.existsSync.mockImplementation((p: string) => p.endsWith('.pub'));
        expect(service.hasIDED25519Key()).toBe(false);
    });

    it('returns false when the public key is missing', () => {
        fsMock.existsSync.mockImplementation((p: string) => !p.endsWith('.pub'));
        expect(service.hasIDED25519Key()).toBe(false);
    });
});

describe('getPlatformInfo', () => {
    let service: ConnectionService;
    let configGetMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
        configGetMock = jest.fn().mockReturnValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: configGetMock });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('uses the configured windows shell setting and classifies it as cmd', () => {
        jest.spyOn(os, 'platform').mockReturnValue('win32');
        configGetMock.mockReturnValue(String.raw`C:\Windows\System32\cmd.exe`);

        const info = service.getPlatformInfo();

        expect(info.type).toBe('cmd');
        expect(info.shell).toBe(String.raw`C:\Windows\System32\cmd.exe`);
    });

    it('falls back to COMSPEC on windows when no shell is configured', () => {
        jest.spyOn(os, 'platform').mockReturnValue('win32');
        const original = process.env.COMSPEC;
        process.env.COMSPEC = String.raw`C:\Windows\cmd.exe`;

        const info = service.getPlatformInfo();

        expect(info.type).toBe('cmd');
        process.env.COMSPEC = original;
    });

    it('detects a configured powershell shell', () => {
        jest.spyOn(os, 'platform').mockReturnValue('win32');
        configGetMock.mockReturnValue(String.raw`C:\Program Files\PowerShell\7\pwsh.exe`);

        const info = service.getPlatformInfo();

        expect(info.type).toBe('powershell');
    });

    it('uses the configured mac shell setting on darwin', () => {
        jest.spyOn(os, 'platform').mockReturnValue('darwin');
        configGetMock.mockReturnValue('/bin/zsh');

        const info = service.getPlatformInfo();

        expect(info.type).toBe('zsh');
    });

    it('falls back to the SHELL environment variable on linux when unconfigured', () => {
        jest.spyOn(os, 'platform').mockReturnValue('linux');
        const original = process.env.SHELL;
        process.env.SHELL = '/bin/bash';

        const info = service.getPlatformInfo();

        expect(info.type).toBe('bash');
        expect(info.shell).toBe('/bin/bash');
        process.env.SHELL = original;
    });

    it('detects a configured fish shell', () => {
        jest.spyOn(os, 'platform').mockReturnValue('linux');
        configGetMock.mockReturnValue('/usr/bin/fish');

        const info = service.getPlatformInfo();

        expect(info.type).toBe('fish');
    });

    it('classifies unrecognized shells as other', () => {
        jest.spyOn(os, 'platform').mockReturnValue('linux');
        configGetMock.mockReturnValue('/usr/bin/tcsh');

        const info = service.getPlatformInfo();

        expect(info.type).toBe('other');
    });
});

describe('generateSSHKeyCopyCommand', () => {
    let service: ConnectionService;

    const testDevice: Device = {
        id: 'copy-1',
        name: 'CopyDevice',
        host: '192.168.1.70',
        username: 'zgx',
        port: 22,
        isSetup: true,
        useKeyAuth: true,
        keySetup: { keyGenerated: true, keyCopied: false, connectionTested: false },
        createdAt: new Date().toISOString()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('generates a cmd command using "type" for piping the key', () => {
        jest.spyOn(service, 'getPlatformInfo').mockReturnValue({ shell: 'cmd.exe', type: 'cmd' });

        const cmd = service.generateSSHKeyCopyCommand(testDevice);

        expect(cmd).toContain('type "');
        expect(cmd).toContain(`ssh ${testDevice.username}@${testDevice.host}`);
    });

    it('generates a powershell command using Get-Content', () => {
        jest.spyOn(service, 'getPlatformInfo').mockReturnValue({ shell: 'pwsh.exe', type: 'powershell' });

        const cmd = service.generateSSHKeyCopyCommand(testDevice);

        expect(cmd).toContain('Get-Content');
    });

    it('generates a posix command using cat for bash/zsh/other shells', () => {
        jest.spyOn(service, 'getPlatformInfo').mockReturnValue({ shell: '/bin/bash', type: 'bash' });

        const cmd = service.generateSSHKeyCopyCommand(testDevice);

        expect(cmd).toContain('cat "');
    });

    it('includes -p and the port for a non-standard ssh port', () => {
        jest.spyOn(service, 'getPlatformInfo').mockReturnValue({ shell: '/bin/bash', type: 'bash' });

        const cmd = service.generateSSHKeyCopyCommand({ ...testDevice, port: 2222 });

        expect(cmd).toContain('-p 2222');
    });

    it('omits the -p flag for the default ssh port 22', () => {
        jest.spyOn(service, 'getPlatformInfo').mockReturnValue({ shell: '/bin/bash', type: 'bash' });

        const cmd = service.generateSSHKeyCopyCommand({ ...testDevice, port: 22 });

        expect(cmd).toContain(`ssh ${testDevice.username}@${testDevice.host}`);
        expect(cmd).not.toMatch(/ssh -p \d+/);
    });
});

describe('ensureRemoteSSHExtensionReady', () => {
    let service: ConnectionService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns true immediately when the extension is already active', async () => {
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: true, activate: jest.fn() });

        const ready = await (service as any).ensureRemoteSSHExtensionReady();

        expect(ready).toBe(true);
    });

    it('activates the extension when found but inactive', async () => {
        const activate = jest.fn().mockResolvedValue(undefined);
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: false, activate });

        const ready = await (service as any).ensureRemoteSSHExtensionReady();

        expect(activate).toHaveBeenCalled();
        expect(ready).toBe(true);
    });

    it('prompts to install and opens the marketplace search when the user accepts', async () => {
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Install');

        const ready = await (service as any).ensureRemoteSSHExtensionReady();

        expect(ready).toBe(false);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.extensions.search',
            '@id:ms-vscode-remote.remote-ssh'
        );
    });

    it('returns false without opening the marketplace when the user declines', async () => {
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        const ready = await (service as any).ensureRemoteSSHExtensionReady();

        expect(ready).toBe(false);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'workbench.extensions.search',
            expect.anything()
        );
    });
});

describe('resolveConnectLabel', () => {
    let service: ConnectionService;
    let fsMock: any;

    beforeEach(() => {
        fsMock = require('fs');
        jest.clearAllMocks();
        fsMock.existsSync.mockReturnValue(false);
        fsMock.readFileSync.mockReturnValue('');
        service = new ConnectionService();
    });

    it('returns the plain user@host target for the default port 22', async () => {
        const device: Device = {
            id: 'label-1', name: 'LabelDevice', host: '1.2.3.4', username: 'zgx', port: 22,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: new Date().toISOString()
        };

        const label = await (service as any).resolveConnectLabel(device);

        expect(label).toBe('zgx@1.2.3.4');
        expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    it('derives an alias and writes an SSH config entry for a non-default port', async () => {
        const device: Device = {
            id: 'label-2', name: 'LabelDevice2', host: '1.2.3.4', username: 'zgx', port: 2222,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: new Date().toISOString()
        };

        const label = await (service as any).resolveConnectLabel(device);

        expect(label).toBe('zgx-1.2.3.4-2222');
        expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('strips unsafe characters from the host when deriving the alias', async () => {
        const device: Device = {
            id: 'label-3', name: 'LabelDevice3', host: 'host;rm -rf /', username: 'zgx', port: 2222,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: new Date().toISOString()
        };

        const label = await (service as any).resolveConnectLabel(device);

        expect(label.startsWith('zgx-')).toBe(true);
        expect(label).not.toMatch(/[;\s/]/);
    });
});

describe('handleRemoteSSHConnectionFailure', () => {
    let service: ConnectionService;
    let testDevice: Device;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
        testDevice = {
            id: 'fail-1', name: 'FailDevice', host: '10.1.1.1', username: 'zgx', port: 22,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: false },
            createdAt: new Date().toISOString()
        };
    });

    it('adds to SSH config when the user chooses that option', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Add to SSH Config');

        await (service as any).handleRemoteSSHConnectionFailure(testDevice);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('remote-ssh.addNewSshHost');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('Please add this SSH host'),
            { modal: false }
        );
    });

    it('shows manual connection instructions when the user chooses that option', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Try Manual Connection');

        await (service as any).handleRemoteSSHConnectionFailure(testDevice);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('Manual SSH connection command'),
            { modal: true }
        );
    });

    it('does nothing further when the user cancels', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Cancel');

        await (service as any).handleRemoteSSHConnectionFailure(testDevice);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('includes the port flag in the manual ssh command for a non-default port', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Try Manual Connection');
        const devWithPort = { ...testDevice, port: 2222 };

        await (service as any).handleRemoteSSHConnectionFailure(devWithPort);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('-p 2222'),
            { modal: true }
        );
    });
});

describe('connectViaRemoteSSH', () => {
    let service: ConnectionService;
    let testDevice: Device;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
        testDevice = {
            id: 'remote-1', name: 'RemoteDevice', host: '10.0.0.9', username: 'zgx', port: 22,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: new Date().toISOString()
        };
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: true, activate: jest.fn() });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('opens the remote folder and shows a success message when the extension is ready', async () => {
        await service.connectViaRemoteSSH(testDevice);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.anything(),
            { forceNewWindow: false }
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('Successfully connected')
        );
    });

    it('honors the forceNewWindow flag', async () => {
        await service.connectViaRemoteSSH(testDevice, true);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.anything(),
            { forceNewWindow: true }
        );
    });

    it('returns early without opening a folder when the Remote-SSH extension is unavailable', async () => {
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        await service.connectViaRemoteSSH(testDevice);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.anything(),
            expect.anything()
        );
    });

    it('offers recovery options when opening the remote folder fails', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockImplementation((cmd: string) => {
            if (cmd === 'vscode.openFolder') {
                return Promise.reject(new Error('connection refused'));
            }
            return Promise.resolve(undefined);
        });
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Add to SSH Config');

        await service.connectViaRemoteSSH(testDevice);

        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('remote-ssh.addNewSshHost');
    });
});

describe('openTerminalForKeyCopy', () => {
    let service: ConnectionService;
    let testDevice: Device;
    let terminalMock: any;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConnectionService();
        testDevice = {
            id: 'term-1', name: 'TermDevice', host: '10.2.2.2', username: 'zgx', port: 22,
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: false, connectionTested: false },
            createdAt: new Date().toISOString()
        };

        terminalMock = { show: jest.fn(), sendText: jest.fn() };
        (vscode.window as any).createTerminal = jest.fn().mockReturnValue(terminalMock);
    });

    it('creates a named terminal, shows it, and sends the copy command', async () => {
        const terminal = await service.openTerminalForKeyCopy(testDevice);

        expect((vscode.window as any).createTerminal).toHaveBeenCalledWith(
            expect.objectContaining({ name: expect.stringContaining(testDevice.name) })
        );
        expect(terminalMock.show).toHaveBeenCalled();
        expect(terminalMock.sendText).toHaveBeenCalledWith(expect.stringContaining(testDevice.host));
        expect(terminal).toBe(terminalMock);
    });
});
