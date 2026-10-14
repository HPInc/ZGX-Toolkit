/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import type * as childProcess from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { AddressInfo } from 'node:net';
import { Connection, Server, utils } from 'ssh2';
import { Device } from '../../types/devices';
import { executeSSHCommand, testSSHConnection } from '../../utils/sshConnection';
import { SSHHostVerificationError } from '../../utils/sshHostVerifier';

jest.mock('node:fs', () => jest.requireActual('node:fs'));
jest.mock('node:child_process', () => jest.requireActual('node:child_process'));
jest.mock('node:os', () => ({ ...jest.requireActual<typeof import('node:os')>('node:os'), homedir: jest.fn() }));
jest.mock('ssh2', () => jest.requireActual('ssh2'));
jest.mock('ssh-config', () => jest.requireActual('ssh-config'));
jest.mock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const realOs = jest.requireActual<typeof import('node:os')>('node:os');
const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
const fileExists = realFs.existsSync;
const readFile = realFs.readFileSync;
const systemConfigFile = realOs.platform() === 'win32'
    ? path.join(process.env.ProgramData || String.raw`C:\ProgramData`, 'ssh', 'ssh_config') : '/etc/ssh/ssh_config';
const keygenCandidates = realOs.platform() === 'win32'
    ? [path.join(process.env.windir || String.raw`C:\Windows`, 'System32', 'OpenSSH', 'ssh-keygen.exe')]
    : ['/usr/bin/ssh-keygen', '/bin/ssh-keygen'];
const keygen = keygenCandidates.find(filename => realFs.existsSync(filename));
const describeWithOpenSSH = keygen ? describe : describe.skip;
const hostKeys = utils.generateKeyPairSync('ed25519');
const changedHostKeys = utils.generateKeyPairSync('ed25519');
const clientKeys = utils.generateKeyPairSync('ed25519');
const password = 'review-only-synthetic-password';

describeWithOpenSSH('real SSH host verification before authentication and sudo', () => {
    let tempDirectory: string;
    let knownHostsFile: string;
    let server: Server;
    let device: Device;
    let authenticationRequests: number;
    let commands: string[];
    let receivedStdin: string;
    let connectionCount: number;
    const clients = new Set<Connection>();

    beforeEach(async () => {
        authenticationRequests = 0;
        commands = [];
        receivedStdin = '';
        connectionCount = 0;
        tempDirectory = realFs.mkdtempSync(path.join(realOs.tmpdir(), 'ztk host trust-'));
        const sshDirectory = path.join(tempDirectory, '.ssh');
        realFs.mkdirSync(sshDirectory, { mode: 0o700 });
        knownHostsFile = path.join(sshDirectory, 'known_hosts');
        realFs.writeFileSync(path.join(sshDirectory, 'id_ed25519'), clientKeys.private, { mode: 0o600 });
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Host *\n  GlobalKnownHostsFile none\n  StrictHostKeyChecking no\n');
        (os.homedir as jest.Mock).mockReturnValue(tempDirectory);
        jest.spyOn(realFs, 'existsSync').mockImplementation(filename => String(filename) !== systemConfigFile && fileExists(filename));
        jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: import('node:fs').PathOrFileDescriptor, options?: unknown) => {
            if (String(filename) === systemConfigFile) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
            return readFile(filename, options as BufferEncoding);
        }) as typeof realFs.readFileSync);
        server = new Server({ hostKeys: [hostKeys.private], algorithms: { cipher: ['aes128-ctr'], kex: ['ecdh-sha2-nistp256'], hmac: ['hmac-sha2-256'] } }, client => {
            clients.add(client);
            connectionCount += 1;
            client.on('error', () => {});
            client.on('close', () => clients.delete(client));
            client.on('authentication', context => {
                authenticationRequests += 1;
                if (context.method === 'publickey') {
                    context.accept();
                } else {
                    context.reject(['publickey']);
                }
            });
            client.on('ready', () => {
                client.on('session', accept => {
                    const session = accept();
                    session.on('exec', (acceptExec, _rejectExec, info) => {
                        commands.push(info.command);
                        const stream = acceptExec();
                        stream.on('data', (data: Buffer) => { receivedStdin += data.toString(); });
                        stream.on('end', () => { stream.exit(0); stream.end(); });
                    });
                });
            });
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const timestamp = new Date().toISOString();
        device = {
            id: 'review-device', name: 'Review device', host: '127.0.0.1',
            port: (server.address() as AddressInfo).port, username: 'synthetic-user',
            isSetup: true, useKeyAuth: true,
            keySetup: { keyGenerated: true, keyCopied: true, connectionTested: true },
            createdAt: timestamp, updatedAt: timestamp
        };
    });

    afterEach(async () => {
        for (const client of clients) {
            client.end();
        }
        await new Promise<void>(resolve => server.close(() => resolve()));
        clients.clear();
        realFs.rmSync(tempDirectory, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    function knownHostEntry(publicKey = hostKeys.public): string {
        return `[${device.host}]:${device.port} ${publicKey.trim()}`;
    }

    function executeSudo(retries = 0) {
        return executeSSHCommand(device, 'sudo -S true', { readyTimeout: 3000 }, {
            sudoPassword: password, timeoutSeconds: 3, retries, retryDelayMs: 1
        });
    }

    function expectNoCredentials(): void {
        expect(authenticationRequests).toBe(0);
        expect(commands).toEqual([]);
        expect(receivedStdin).toBe('');
    }

    function systemConfig(content: string): void {
        jest.spyOn(realFs, 'existsSync').mockImplementation(filename => String(filename) === systemConfigFile || fileExists(filename));
        jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: import('node:fs').PathOrFileDescriptor, options?: unknown) =>
            String(filename) === systemConfigFile ? content : readFile(filename, options as BufferEncoding)) as typeof realFs.readFileSync);
    }

    it.each([false, true])('enforces system revocation even with no user configuration: %s', withoutUserConfig => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const revoked = path.join(tempDirectory, '.ssh', 'system-revoked');
        realFs.writeFileSync(revoked, hostKeys.public);
        systemConfig(`Host *\n  RevokedHostKeys "${revoked.replaceAll('\\', '/')}"\n  GlobalKnownHostsFile none\n`);
        if (withoutUserConfig) realFs.unlinkSync(path.join(tempDirectory, '.ssh', 'config'));
        return executeSudo(2).then(result => {
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(result.stderr).toContain('host key is revoked');
            expect(connectionCount).toBe(1);
            expectNoCredentials();
        });
    });

    it('uses user policy before system defaults, matching OpenSSH first-value precedence', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), 'Host *\n  RevokedHostKeys none\n  GlobalKnownHostsFile none\n');
        systemConfig('Host *\n  RevokedHostKeys /missing-system-revocations\n');
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it.each(['user', 'system'])('cannot negotiate an enrolled key excluded by %s HostKeyAlgorithms', async source => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const policy = 'Host *\n  HostKeyAlgorithms rsa-sha2-512\n  GlobalKnownHostsFile none\n';
        if (source === 'system') systemConfig(policy);
        else realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), policy);
        const result = await executeSudo();
        expect(result.success).toBe(false);
        expectNoCredentials();
    });

    it('allows an enrolled server with an explicitly permitted host-key algorithm', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), 'Host *\n  HostKeyAlgorithms ssh-ed25519\n  GlobalKnownHostsFile none\n');
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it.each(['CheckHostIP yes', 'VerifyHostKeyDNS yes', 'UpdateHostKeys ask'])('rejects unimplemented system host policy before connecting: %s', policy => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        systemConfig(`Match originalhost 127.0.0.1\n  ${policy}\n`);
        return executeSudo(2).then(result => {
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(connectionCount).toBe(0);
            expectNoCredentials();
        });
    });

    it.each([
        'RefuseConnection "Access denied by policy"', 'RefuseConnection no',
        'ProxyCommand ssh bastion', 'ProxyJump bastion', 'KnownHostsCommand /untrusted/command',
        'UserKnownHostsFile %Q', 'UserKnownHostsFile ~other/known_hosts',
        'UserKnownHostsFile ${ZTK_UNSET_LOOPBACK_TRUST_VARIABLE}',
        'Ciphers +aes128-ctr', 'KexAlgorithms unknown', 'MACs hmac-*', 'RekeyLimit 1G'
    ])('rejects applicable system policy before any connection or retry: %s', async policy => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        systemConfig(`Match originalhost 127.0.0.1\n  ${policy}\n`);
        const result = await executeSudo(2);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(connectionCount).toBe(0);
        expectNoCredentials();
    });

    it('allows enrolled connections with explicitly permitted transport algorithms', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        systemConfig('Host *\n  Ciphers aes128-ctr\n  KexAlgorithms ecdh-sha2-nistp256\n  MACs hmac-sha2-256\n');
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it.each(['Ciphers aes256-ctr', 'KexAlgorithms ecdh-sha2-nistp384', 'MACs hmac-sha2-512'])('does not authenticate when transport policy excludes the server: %s', async policy => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        systemConfig(`Host *\n  ${policy}\n`);
        expect((await executeSudo()).success).toBe(false);
        expectNoCredentials();
    });

    it.each(['EACCES', 'EPERM', 'EIO'])('rejects inaccessible known-hosts files before connecting: %s', async code => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const openFile = realFs.promises.open;
        jest.spyOn(realFs.promises, 'open').mockImplementation(async (filename, flags, mode) => {
            if (String(filename) === knownHostsFile) throw Object.assign(new Error(code), { code });
            return openFile(filename, flags, mode);
        });
        const result = await executeSudo(2);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(connectionCount).toBe(0);
        expectNoCredentials();
    });

    it('blocks an unknown server before authentication despite StrictHostKeyChecking no', async () => {
        const result = await executeSudo();
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(result.stderr).toContain('Verify the device fingerprint independently');
        expectNoCredentials();
    });

    it('blocks a changed host key without retrying or transmitting a password', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry(changedHostKeys.public));
        const result = await executeSudo(2);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(connectionCount).toBe(1);
        expectNoCredentials();
    });

    it('blocks a revoked key even when an otherwise trusted entry exists', async () => {
        realFs.writeFileSync(knownHostsFile, `${knownHostEntry()}\n@revoked ${knownHostEntry()}\n`);
        const result = await executeSudo();
        expect(result.success).toBe(false);
        expect(result.stderr).toContain('revoked');
        expectNoCredentials();
    });

    it('allows sudo stdin only after the actual server key matches the enrolled key', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const result = await executeSudo();
        expect(result.success).toBe(true);
        expect(authenticationRequests).toBeGreaterThan(0);
        expect(commands).toEqual(['sudo -S true']);
        expect(receivedStdin).toBe(password + '\n');
    });

    it('accepts hashed known-hosts entries using real OpenSSH matching', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const hashResult = spawnSync(keygen!, ['-H', '-f', knownHostsFile], { encoding: 'utf8', timeout: 5000 });
        expect(hashResult.status).toBe(0);
        expect(realFs.readFileSync(knownHostsFile, 'utf8')).toContain('|1|');
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it('verifies the effective HostName when connecting through an SSH config alias', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), `Host review-alias\n  HostName 127.0.0.1\n  Port ${device.port}\n  GlobalKnownHostsFile none\n`);
        device.host = 'review-alias';
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it('uses an explicitly enrolled HostKeyAlias even at a non-default port', async () => {
        realFs.writeFileSync(knownHostsFile, `enrolled-device ${hostKeys.public.trim()}`);
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), 'Host *\n  HostKeyAlias enrolled-device\n  GlobalKnownHostsFile none\n');
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it('also rejects an untrusted server in the connection-test path', async () => {
        const result = await testSSHConnection(device, { readyTimeout: 3000 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('SSH host key verification failed');
        expect(result.hostVerificationFailed).toBe(true);
        expectNoCredentials();
    });

    it.each(['Match exec "echo unsafe"', 'Include ~/.ssh/additional-config'])('refuses unresolved Match configuration without connecting: %s', directive => {
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), directive + '\n');
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'additional-config'), 'Match exec "echo unsafe"\n');
        return expect(executeSudo().then(result => {
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(connectionCount).toBe(0);
            expectNoCredentials();
        })).resolves.toBeUndefined();
    });

    it.each(['trusted', 'unknown', 'changed', 'revoked'])('enforces %s trust from an included HostKeyAlias and known-hosts policy', async trust => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        const includedKnownHosts = path.join(sshDirectory, 'included_known_hosts');
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Include included.conf\n');
        realFs.writeFileSync(path.join(sshDirectory, 'included.conf'), 'Host *\n  HostKeyAlias included-device\n  UserKnownHostsFile ~/.ssh/included_known_hosts\n  GlobalKnownHostsFile none\n  StrictHostKeyChecking no\n');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const entry = `included-device ${trust === 'changed' ? changedHostKeys.public.trim() : hostKeys.public.trim()}`;
        realFs.writeFileSync(includedKnownHosts, trust === 'unknown' ? '' : trust === 'revoked' ? `${entry}\n@revoked ${entry}\n` : entry);

        const result = await executeSudo(2);

        expect(result.success).toBe(trust === 'trusted');
        if (trust === 'trusted') {
            expect(receivedStdin).toBe(password + '\n');
        } else {
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(connectionCount).toBe(1);
            expectNoCredentials();
        }
    });

    it.each(['trusted', 'unknown', 'changed', 'revoked'])('enforces %s trust selected by Match and a conditional Include', async trust => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        const matchedKnownHosts = path.join(sshDirectory, 'matched_known_hosts');
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Match originalhost 127.0.0.1 user synthetic-user\n  Include matched.conf\nMatch all\n  UserKnownHostsFile ~/.ssh/known_hosts\n  GlobalKnownHostsFile none\n');
        realFs.writeFileSync(path.join(sshDirectory, 'matched.conf'), 'HostKeyAlias matched-device\nUserKnownHostsFile ~/.ssh/matched_known_hosts\nGlobalKnownHostsFile none\nMatch originalhost other\n  UserKnownHostsFile none\n');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const entry = `matched-device ${trust === 'changed' ? changedHostKeys.public.trim() : hostKeys.public.trim()}`;
        realFs.writeFileSync(matchedKnownHosts, trust === 'unknown' ? '' : trust === 'revoked' ? `${entry}\n@revoked ${entry}\n` : entry);

        const result = await executeSudo(2);

        expect(result.success).toBe(trust === 'trusted');
        if (trust === 'trusted') {
            expect(authenticationRequests).toBeGreaterThan(0);
            expect(receivedStdin).toBe(password + '\n');
        } else {
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(connectionCount).toBe(1);
            expectNoCredentials();
        }
    });

    it.each(['KnownHostsCommand "echo unsafe"', 'RevokedHostKeys ~/.ssh/revoked_keys'])('refuses unsupported or unreadable policy selected by Match: %s', policy => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), `Match originalhost 127.0.0.1\n  ${policy}\n  GlobalKnownHostsFile none\n`);
        return expect(executeSudo().then(result => {
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expectNoCredentials();
        })).resolves.toBeUndefined();
    });

    it.each(['plaintext', 'KRL'])('enforces %s revocation selected through Match and Include before any credentials', async format => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        const revocationFile = path.join(sshDirectory, 'revoked keys');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Match originalhost 127.0.0.1 user synthetic-user\n  Include revocation.conf\nMatch all\n  GlobalKnownHostsFile none\n');
        realFs.writeFileSync(path.join(sshDirectory, 'revocation.conf'), 'RevokedHostKeys "~/.ssh/revoked keys"\n');
        if (format === 'KRL') {
            const publicKeyFile = path.join(sshDirectory, 'revoked.pub');
            realFs.writeFileSync(publicKeyFile, hostKeys.public);
            const generation = spawnSync(keygen!, ['-k', '-f', revocationFile, publicKeyFile], { encoding: 'utf8', timeout: 5000, shell: false });
            expect(generation.status).toBe(0);
        } else {
            realFs.writeFileSync(revocationFile, `# synthetic list\n${changedHostKeys.public}\n${hostKeys.public}\n`);
        }

        const result = await executeSudo(2);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(result.stderr).toContain('revoked');
        expect(connectionCount).toBe(1);
        expectNoCredentials();
    });

    it.each(['plaintext', 'KRL'])('permits an enrolled server not revoked by a valid %s file', async format => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        const revocationFile = path.join(sshDirectory, 'revoked_keys');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Host *\n  RevokedHostKeys ~/.ssh/revoked_keys\n  GlobalKnownHostsFile none\n');
        if (format === 'KRL') {
            const publicKeyFile = path.join(sshDirectory, 'other.pub');
            realFs.writeFileSync(publicKeyFile, changedHostKeys.public);
            expect(spawnSync(keygen!, ['-k', '-f', revocationFile, publicKeyFile], { encoding: 'utf8', timeout: 5000, shell: false }).status).toBe(0);
        } else {
            realFs.writeFileSync(revocationFile, changedHostKeys.public);
        }
        expect((await executeSudo()).success).toBe(true);
        expect(authenticationRequests).toBeGreaterThan(0);
        expect(receivedStdin).toBe(password + '\n');
    });

    it.each(['malformed plaintext', 'malformed KRL', 'missing', 'directory'])('blocks %s revocation sources despite enrolled trust', async failure => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        const revocationFile = path.join(sshDirectory, 'revoked_keys');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Host *\n  RevokedHostKeys ~/.ssh/revoked_keys\n  GlobalKnownHostsFile none\n');
        if (failure === 'directory') realFs.mkdirSync(revocationFile);
        else if (failure !== 'missing') realFs.writeFileSync(revocationFile, failure === 'malformed KRL' ? Buffer.from('SSHKRL\n\0invalid') : 'not a public key\n');
        const result = await executeSudo(2);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(SSHHostVerificationError);
        expect(result.stderr).toContain('RevokedHostKeys check failed');
        expect(connectionCount).toBe(1);
        expectNoCredentials();
    });

    it('never enrolls an unknown key merely because the revocation list is empty', async () => {
        const sshDirectory = path.join(tempDirectory, '.ssh');
        realFs.writeFileSync(path.join(sshDirectory, 'revoked_keys'), '# empty revocation list\n');
        realFs.writeFileSync(path.join(sshDirectory, 'config'), 'Host *\n  RevokedHostKeys ~/.ssh/revoked_keys\n  GlobalKnownHostsFile none\n');
        expect((await executeSudo()).success).toBe(false);
        expectNoCredentials();
    });

    it('allows none to disable only the separate revocation file', async () => {
        realFs.writeFileSync(path.join(tempDirectory, '.ssh', 'config'), 'Host *\n  RevokedHostKeys none\n  GlobalKnownHostsFile none\n');
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        expect((await executeSudo()).success).toBe(true);
        expect(receivedStdin).toBe(password + '\n');
    });

    it('terminates a real stalled process at the aggregate deadline without sending any credentials', async () => {
        realFs.writeFileSync(knownHostsFile, knownHostEntry());
        const realChildProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
        const executeFile = realChildProcess.execFile;
        let child: childProcess.ChildProcess | undefined;
        let closed: Promise<void> | undefined;
        let beats = 0;
        jest.spyOn(realChildProcess, 'execFile').mockImplementation(((_executable: string, _args: string[], options: childProcess.ExecFileOptions, callback: (...args: unknown[]) => void) => {
            child = executeFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options, callback);
            closed = new Promise<void>(resolve => child!.once('close', () => resolve()));
            return child;
        }) as typeof realChildProcess.execFile);
        const heartbeat = setInterval(() => { beats++; }, 20);
        try {
            const result = await executeSSHCommand(device, 'sudo -S true', { readyTimeout: 10000 }, {
                sudoPassword: password, timeoutSeconds: 10, retries: 2, retryDelayMs: 1
            });
            await closed;
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(SSHHostVerificationError);
            expect(result.stderr).toContain('aggregate deadline');
            expect(child?.killed).toBe(true);
            expect(beats).toBeGreaterThan(10);
            expect(realChildProcess.execFile).toHaveBeenCalledTimes(1);
            expect(connectionCount).toBe(1);
            expectNoCredentials();
        } finally {
            clearInterval(heartbeat);
            if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
    }, 15000);
});