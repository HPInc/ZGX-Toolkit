/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { utils } from 'ssh2';
import { createSSHHostVerifier as createVerifier, preflightSSHHostVerifier, SSHHostVerificationError } from '../../utils/sshHostVerifier';
import { logger } from '../../utils/logger';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:fs', () => ({ constants: jest.requireActual<typeof import('node:fs')>('node:fs').constants, promises: { open: jest.fn(), access: jest.fn(), mkdtemp: jest.fn(), writeFile: jest.fn(), rm: jest.fn() } }));
jest.mock('node:os', () => ({ homedir: jest.fn(), platform: jest.fn(), tmpdir: jest.fn() }));
jest.mock('ssh2', () => jest.requireActual('ssh2'));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn() } }));

const host = 'device.example';
function ed25519PublicKey(keyBytes: Buffer): string {
    const keyType = Buffer.from('ssh-ed25519');
    const keyTypeLength = Buffer.alloc(4);
    keyTypeLength.writeUInt32BE(keyType.length);
    const keyLength = Buffer.alloc(4);
    keyLength.writeUInt32BE(keyBytes.length);
    return `ssh-ed25519 ${Buffer.concat([keyTypeLength, keyType, keyLength, keyBytes]).toString('base64')}`;
}

const publicKey = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' });
if (!publicKey.x) throw new Error('Missing ED25519 public-key bytes');
const keyPair = { public: ed25519PublicKey(Buffer.from(publicKey.x, 'base64url')) };
const parsedKey = utils.parseKey(keyPair.public);
if (parsedKey instanceof Error || Array.isArray(parsedKey)) {
    throw new Error(`Unable to generate the test public key: ${parsedKey instanceof Error ? parsedKey.message : 'unexpected key array'}`);
}
const hostKey = parsedKey.getPublicSSH();
const encodedKey = hostKey.toString('base64');
const knownHosts = path.resolve('/home/review/.ssh/known_hosts');
const keygen = '/usr/bin/ssh-keygen';
const entry = `${host} ssh-ed25519 ${encodedKey}`;
const queryResult = jest.fn<(...args: any[]) => any>();
const exists = jest.fn<(...args: any[]) => any>();
const trustStat = jest.fn<(...args: any[]) => any>();
const trustAccess = jest.fn<(...args: any[]) => any>();
const openRevocation = jest.fn<(...args: any[]) => any>();
const fileStat = jest.fn<(...args: any[]) => any>();
const readChunk = jest.fn<(...args: any[]) => any>();
const closeFile = jest.fn<(...args: any[]) => any>();

function createSSHHostVerifier(...args: Parameters<typeof createVerifier>) {
    const verifier = createVerifier(...args);
    return (key: Buffer | string) => new Promise<boolean>(resolve => verifier(key, resolve));
}

describe('SSH host verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fs.promises.open as jest.Mock).mockReset().mockImplementation(async (filename: unknown) => {
            const revocation = !String(filename).includes('known_hosts') && !String(filename).includes('custom hosts') && !String(filename).includes('device-alias-device');
            if (revocation) openRevocation(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
            else trustAccess(filename);
            return {
                stat: async () => revocation ? fileStat(10) : trustStat(filename),
                read: async (buffer: Buffer, offset: number, length: number, position: null) => ({ bytesRead: readChunk(10, buffer, offset, length, position), buffer }),
                close: async () => { closeFile(10); }
            };
        });
        (fs.promises.access as jest.Mock).mockReset().mockImplementation(async (filename: unknown) => {
            if (!exists(filename)) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
        });
        for (const method of [fs.promises.mkdtemp, fs.promises.writeFile, fs.promises.rm]) (method as jest.Mock).mockReset();
        (execFile as unknown as jest.Mock).mockReset().mockImplementation((executable: unknown, args: unknown, options: unknown, callback: unknown) => {
            const result = queryResult(executable, args, options);
            setImmediate(() => (callback as (error: Error | null, stdout: string, stderr: string) => void)(result.error || (result.status === 0 ? null : Object.assign(new Error('Query failed'), { code: result.status })), result.stdout, result.stderr));
            return {};
        });
        (exists as jest.Mock).mockReset();
        for (const method of [openRevocation, fileStat, readChunk, closeFile, fs.promises.mkdtemp, fs.promises.writeFile, fs.promises.rm]) {
            (method as jest.Mock).mockReset();
        }
        (openRevocation as jest.Mock).mockReturnValue(10);
        (fileStat as jest.Mock).mockReturnValue({ isFile: () => true, size: 0 });
        (readChunk as jest.Mock).mockReturnValue(0);
        (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
        (fs.promises.mkdtemp as jest.Mock).mockReturnValue('/tmp/ztk-revocation-test');
        (queryResult as jest.Mock).mockReset();
        (os.homedir as jest.Mock).mockReturnValue('/home/review');
        (os.platform as jest.Mock).mockReturnValue('linux');
        (exists as jest.Mock).mockImplementation(filename => filename === keygen || filename === knownHosts);
        (trustStat as jest.Mock).mockReset().mockImplementation(filename => {
            if (!exists(filename as string)) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
            return { isFile: () => true };
        });
        (trustAccess as jest.Mock).mockReset();
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: entry, stderr: '' });
    });

    function revocationContent(content: string | Buffer): void {
        const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
        (fileStat as jest.Mock).mockReturnValue({ isFile: () => true, size: bytes.length });
        (readChunk as jest.Mock).mockImplementationOnce((_descriptor, buffer) => {
            bytes.copy(buffer as Buffer);
            return bytes.length;
        });
    }

    it('accepts only the exact trusted public key', async () => {
        const verify = createSSHHostVerifier({ host, port: 22 }, null, host);
        expect((await verify(hostKey))).toBe(true);
        expect(queryResult).toHaveBeenCalledWith(keygen, ['-F', host, '-f', knownHosts], expect.objectContaining({ shell: false, signal: expect.any(AbortSignal) }));
    });

    it('preserves leading zero bytes in an ED25519 fixture', () => {
        const bytes = Buffer.alloc(32, 1);
        bytes[0] = 0;
        const parsed = utils.parseKey(ed25519PublicKey(bytes));
        if (parsed instanceof Error || Array.isArray(parsed)) throw new Error('Unable to parse leading-zero fixture');
        expect(parsed.getPublicSSH().subarray(-32)).toEqual(bytes);
    });

    it('maps the explicit HostKeyAlgorithms policy into negotiation without replacing other algorithm settings', () => {
        const config = { host, algorithms: { cipher: ['aes128-ctr' as const] } };
        createSSHHostVerifier(config, { hostkeyalgorithms: 'rsa-sha2-512,ssh-ed25519' }, host);
        expect(config.algorithms).toEqual({ cipher: ['aes128-ctr'], serverHostKey: ['rsa-sha2-512', 'ssh-ed25519'] });
    });

    it.each(['', '-ssh-ed25519', '+ssh-rsa', '^ssh-ed25519', 'ssh-*', 'unknown', 'ssh-ed25519,', 'ssh-ed25519-cert-v01@openssh.com'])('rejects unsupported host-key algorithm policy before connecting: %s', policy => {
        expect(() => createSSHHostVerifier({ host }, { HostKeyAlgorithms: policy }, host)).toThrow('Unsupported HostKeyAlgorithms');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['CheckHostIP', 'VerifyHostKeyDNS', 'UpdateHostKeys'])('allows disabled %s but refuses an applicable unimplemented policy', setting => {
        expect(() => createSSHHostVerifier({ host }, { [setting]: 'no' }, host)).not.toThrow();
        expect(() => createSSHHostVerifier({ host }, { [setting]: 'yes' }, host)).toThrow(setting);
        expect(() => createSSHHostVerifier({ host }, { [setting]: 'ask' }, host)).toThrow(setting);
    });

    it.each(['RequiredRSASize', 'CASignatureAlgorithms'])('refuses unimplemented %s rather than ignoring it', setting => {
        expect(() => createSSHHostVerifier({ host }, { [setting]: '2048' }, host)).toThrow(setting);
    });

    it.each(['', 'no', 'Access denied'])('enforces every RefuseConnection directive: %s', message => {
        expect(() => createSSHHostVerifier({ host }, { refuseconnection: message }, host)).toThrow('RefuseConnection');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['ProxyCommand', 'ProxyJump', 'KnownHostsCommand'])('rejects %s before connecting unless disabled', setting => {
        expect(() => createSSHHostVerifier({ host }, { [setting]: 'NONE' }, host)).not.toThrow();
        for (const policy of ['', 'bastion', ['none', 'bastion']]) {
            expect(() => createSSHHostVerifier({ host }, { [setting]: policy }, host)).toThrow(setting);
        }
    });

    it('applies all transport restrictions while preserving unrelated settings', () => {
        const config = { host, algorithms: { compress: ['none' as const] } };
        createSSHHostVerifier(config, { ciphers: 'aes256-ctr,aes128-ctr', KexAlgorithms: 'curve25519-sha256', MACs: 'hmac-sha2-256' }, host);
        expect(config.algorithms).toEqual({ compress: ['none'], cipher: ['aes256-ctr', 'aes128-ctr'], kex: ['curve25519-sha256'], hmac: ['hmac-sha2-256'] });
    });

    it.each(['Ciphers', 'KexAlgorithms', 'MACs'])('fails closed on unsupported %s syntax', setting => {
        for (const policy of ['', 'unknown', '+aes128-ctr', '-*sha1*', '^aes128-ctr', ['aes128-ctr']]) {
            expect(() => createSSHHostVerifier({ host }, { [setting]: policy }, host)).toThrow(setting);
        }
    });

    it('does not silently ignore rekey limits', () => {
        expect(() => createSSHHostVerifier({ host }, { RekeyLimit: '1G' }, host)).toThrow('RekeyLimit');
    });

    it.each(['%Q', '%', '~other/known_hosts', '${ZTK_UNSET_TRUST_TEST_VARIABLE}', ''])('rejects invalid trust paths before connecting: %s', filename => {
        expect(() => createSSHHostVerifier({ host }, { UserKnownHostsFile: filename }, host)).toThrow();
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects a changed key instead of trusting the hostname alone', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `${host} ssh-ed25519 AAAA`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('rejects an unknown host', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 1, stdout: '', stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('rejects a host when no known-hosts files exist', async () => {
        (exists as jest.Mock).mockImplementation(filename => filename === keygen);
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects when the trusted system keygen is unavailable', async () => {
        (exists as jest.Mock).mockReturnValue(false);
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('uses the effective HostName and port rather than the connection alias', async () => {
        expect((await createSSHHostVerifier({ host, port: 2222 }, null, 'device-alias')(hostKey))).toBe(true);
        expect(queryResult).toHaveBeenCalledWith(keygen, ['-F', `[${host}]:2222`, '-f', knownHosts], expect.any(Object));
    });

    it('uses HostKeyAlias verbatim, including for a non-default port', async () => {
        expect((await createSSHHostVerifier({ host, port: 2222 }, { hostkeyalias: 'enrolled-device' }, 'device-alias')(hostKey))).toBe(true);
        expect(queryResult).toHaveBeenCalledWith(keygen, ['-F', 'enrolled-device', '-f', knownHosts], expect.any(Object));
    });

    it('delegates matching hashed hostnames to OpenSSH', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `# Host found\n|1|salt|hash ssh-ed25519 ${encodedKey}`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(true);
    });

    it('delegates matching hostname lists and patterns to OpenSSH', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `*.example,!excluded.example ssh-ed25519 ${encodedKey}`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(true);
    });

    it('rejects a revoked key even when a trusted entry precedes it', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `${entry}\n@revoked ${entry}`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('checks revocation in every file before accepting a trusted entry', async () => {
        const globalFile = path.resolve('/etc/ssh/ssh_known_hosts');
        (exists as jest.Mock).mockReturnValue(true);
        (queryResult as jest.Mock).mockImplementation((_binary, args) => ({
            status: 0, stdout: (args as string[])[3] === globalFile ? `@revoked ${entry}` : entry, stderr: ''
        }));
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('does not treat certificate authority entries as trusted leaf keys', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `@cert-authority ${entry}`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('does not accept an incorrect public key type', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 0, stdout: `${host} ssh-rsa ${encodedKey}`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it.each([
        { status: 2, stdout: '', stderr: '' },
        { status: null, stdout: '', stderr: '', error: new Error('Timed out') },
        { status: 0, stdout: entry, stderr: 'Invalid entry' },
        { status: 1, stdout: '', stderr: 'Permission denied' },
        { status: 0, stdout: 'malformed-entry', stderr: '' }
    ])('fails closed on lookup failure or malformed trust data: %j', async lookup => {
        (queryResult as jest.Mock).mockReturnValue(lookup);
        expect((await createSSHHostVerifier({ host }, null, host)(hostKey))).toBe(false);
    });

    it('respects custom, case-insensitive known-hosts directives', async () => {
        const customFile = path.resolve('/home/review/custom hosts');
        (exists as jest.Mock).mockImplementation(filename => filename === keygen || filename === customFile);
        expect((await createSSHHostVerifier({ host }, { userknownhostsfile: ['~/custom hosts'], globalknownhostsfile: 'none' }, host)(hostKey))).toBe(true);
        expect(queryResult).toHaveBeenCalledWith(keygen, ['-F', host, '-f', customFile], expect.any(Object));
    });

    it('rejects when all known-hosts sources are disabled, regardless of StrictHostKeyChecking', () => {
        const config = { UserKnownHostsFile: 'none', GlobalKnownHostsFile: 'none', StrictHostKeyChecking: 'no' };
        expect(() => createSSHHostVerifier({ host }, config, host)).toThrow('All SSH known-hosts sources are disabled');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('expands supported OpenSSH path tokens', async () => {
        const filename = path.resolve('/home/review/device-alias-device.example-2222-remote-%');
        (exists as jest.Mock).mockImplementation(file => file === keygen || file === filename);
        const config = { UserKnownHostsFile: '%d/%n-%h-%p-%r-%%', GlobalKnownHostsFile: 'none' };
        expect((await createSSHHostVerifier({ host, port: 2222, username: 'remote' }, config, 'device-alias')(hostKey))).toBe(true);
        expect(queryResult).toHaveBeenCalledWith(keygen, ['-F', `[${host}]:2222`, '-f', filename], expect.any(Object));
    });

    it('rejects unsupported path tokens instead of falling back to defaults', () => {
        expect(() => createSSHHostVerifier({ host }, { UserKnownHostsFile: '%Q' }, host)).toThrow('Unsupported known-hosts path token');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['EACCES', 'EPERM', 'EIO', 'ENOTDIR'])('rejects trust-file stat failures before connecting: %s', async code => {
        (trustStat as jest.Mock).mockImplementation(() => { throw Object.assign(new Error(code), { code }); });
        await expect(preflightSSHHostVerifier(createVerifier({ host }, null, host))).rejects.toThrow('Unable to read SSH host trust');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects unreadable trust files before connecting', async () => {
        (trustAccess as jest.Mock).mockImplementation(() => { throw Object.assign(new Error('Denied'), { code: 'EACCES' }); });
        await expect(preflightSSHHostVerifier(createVerifier({ host }, null, host))).rejects.toThrow('Unable to read SSH host trust');
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects nonregular trust files before connecting', async () => {
        (trustStat as jest.Mock).mockReturnValue({ isFile: () => false });
        await expect(preflightSSHHostVerifier(createVerifier({ host }, null, host))).rejects.toThrow('Unable to read SSH host trust');
    });

    it('rechecks access after preflight rather than silently skipping a newly inaccessible file', async () => {
        const verify = createSSHHostVerifier({ host }, null, host);
        (trustStat as jest.Mock).mockImplementation(() => { throw Object.assign(new Error('Denied'), { code: 'EACCES' }); });
        expect((await verify(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['KnownHostsCommand'])('refuses to ignore unsupported %s trust configuration', setting => {
        expect(() => createSSHHostVerifier({ host }, { [setting]: '/review/trust-source' }, host)).toThrow(setting);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('allows a trusted key when the configured revocation list is readable and empty', async () => {
        (openRevocation as jest.Mock).mockReturnValue(10);
        (fileStat as jest.Mock).mockReturnValue({ isFile: () => true, size: 0 });
        (readChunk as jest.Mock).mockReturnValue(0);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(true);
        expect(openRevocation).toHaveBeenCalledWith(path.resolve('/home/review/revoked_keys'), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
        expect(closeFile).toHaveBeenCalledWith(10);
    });

    it('rejects a listed public key before any known-hosts lookup', async () => {
        revocationContent(`# comment\n${keyPair.public.trim()} revoked server\n`);
        const onFailure = jest.fn();
        expect((await createSSHHostVerifier({ host }, { revokedhostkeys: '~/revoked_keys' }, host, onFailure)(hostKey))).toBe(false);
        expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('revoked') }));
        expect(queryResult).not.toHaveBeenCalled();
        expect(closeFile).toHaveBeenCalledWith(10);
    });

    it('allows a different valid public key and comments in a revocation list', async () => {
        revocationContent(`# comment\r\n\r\n${utils.generateKeyPairSync('rsa', { bits: 2048 }).public}\n`);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(true);
    });

    it.each([false, true])('recognizes revoked keys with Base64 padding removed: %s', async removePadding => {
        const pair = utils.generateKeyPairSync('ecdsa', { bits: 256 });
        const parsed = utils.parseKey(pair.public);
        if (parsed instanceof Error || Array.isArray(parsed)) throw new Error('Unable to parse synthetic key');
        const publicKey = parsed.getPublicSSH();
        const padded = publicKey.toString('base64');
        expect(padded).toContain('=');
        const encoded = removePadding ? padded.split('=')[0] : padded;
        revocationContent(`${parsed.type} ${encoded}\n`);
        const onFailure = jest.fn();
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host, onFailure)(publicKey))).toBe(false);
        expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('host key is revoked') }));
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects a long malformed padding run without accepting trust', async () => {
        revocationContent(`ssh-ed25519 ${encodedKey}${'='.repeat(50000)}!\n`);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
        expect(closeFile).toHaveBeenCalledWith(10);
    });

    it.each(['garbage', 'ssh-ed25519 !!!!', `ssh-rsa ${encodedKey}`, `ssh-ed25519 ${Buffer.concat([hostKey, Buffer.from('extra')]).toString('base64')}`, `${entry}`, Buffer.from([0xff]), Buffer.from('SSHKRL')])('fails closed on malformed plaintext: %s', async content => {
        revocationContent(content);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['none', 'NONE'])('disables only the separate revocation check with %s', async setting => {
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: setting }, host)(hostKey))).toBe(true);
        expect(openRevocation).not.toHaveBeenCalled();
        (queryResult as jest.Mock).mockReturnValue({ status: 1, stdout: '', stderr: '' });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: setting }, host)(hostKey))).toBe(false);
    });

    it.each(['%Q', '%', '~other/revoked', '${ZTK_UNSET_REVOCATION_TEST_VARIABLE}'])('rejects unresolved revocation paths: %s', filename => {
        expect(() => createSSHHostVerifier({ host }, { RevokedHostKeys: filename }, host)).toThrow();
        expect(openRevocation).not.toHaveBeenCalled();
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('expands revocation tokens and retains spaces without invoking a shell', async () => {
        expect((await createSSHHostVerifier({ host, port: 2222, username: 'remote' }, { RevokedHostKeys: '%d/%n %h %p %r %k %%' }, 'alias')(hostKey))).toBe(true);
        expect(openRevocation).toHaveBeenCalledWith(path.resolve('/home/review/alias device.example 2222 remote alias %'), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    });

    it.each(['missing', 'unreadable'])('blocks a configured %s revocation file', async reason => {
        (openRevocation as jest.Mock).mockImplementation(() => { throw new Error(reason); });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each([{ isFile: () => false, size: 0 }, { isFile: () => true, size: 16 * 1024 * 1024 + 1 }])('rejects nonregular or oversized revocation files: %j', async metadata => {
        (fileStat as jest.Mock).mockReturnValue(metadata);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(readChunk).not.toHaveBeenCalled();
        expect(closeFile).toHaveBeenCalledWith(10);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['stat', 'read', 'close'])('blocks when file %s fails', async operation => {
        const method = operation === 'stat' ? fileStat : operation === 'read' ? readChunk : closeFile;
        (method as jest.Mock).mockImplementation(() => { throw new Error(operation); });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(closeFile).toHaveBeenCalledWith(10);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('enforces the size bound even if the revocation file grows after stat', async () => {
        (readChunk as jest.Mock).mockImplementation((_descriptor, buffer) => (buffer as Buffer).length);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(closeFile).toHaveBeenCalledWith(10);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('does not silently skip malformed rows after a valid unrelated public key', async () => {
        revocationContent(`${keyPair.public}\ninvalid row\n`);
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('handles bounded reads that split a public-key entry across chunks', async () => {
        const bytes = Buffer.from(keyPair.public);
        (readChunk as jest.Mock).mockImplementationOnce((_descriptor, buffer) => bytes.subarray(0, 10).copy(buffer as Buffer))
            .mockImplementationOnce((_descriptor, buffer) => bytes.subarray(10).copy(buffer as Buffer));
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('expands an environment variable in a revocation path', async () => {
        const previous = process.env.ZTK_REVOCATION_TEST_ROOT;
        process.env.ZTK_REVOCATION_TEST_ROOT = '/review keys';
        try {
            expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '${ZTK_REVOCATION_TEST_ROOT}/revoked' }, host)(hostKey))).toBe(true);
            expect(openRevocation).toHaveBeenCalledWith(path.resolve('/review keys/revoked'), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
        } finally {
            if (previous === undefined) delete process.env.ZTK_REVOCATION_TEST_ROOT;
            else process.env.ZTK_REVOCATION_TEST_ROOT = previous;
        }
    });

    it('queries a snapshot KRL and cleans up before known-hosts lookup', async () => {
        const content = Buffer.from('SSHKRL\n\0synthetic');
        revocationContent(content);
        const publicKeyFile = path.join('/tmp/ztk-revocation-test', 'server.pub');
        (queryResult as jest.Mock).mockReturnValueOnce({ status: 0, stdout: `${publicKeyFile}: ok\n`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(true);
        expect(fs.promises.writeFile).toHaveBeenCalledWith(path.join('/tmp/ztk-revocation-test', 'revoked.krl'), content, { mode: 0o600, flag: 'wx' });
        expect(fs.promises.writeFile).toHaveBeenCalledWith(publicKeyFile, `ssh-ed25519 ${encodedKey} ztk-host-key\n`, { mode: 0o600, flag: 'wx' });
        expect(queryResult).toHaveBeenNthCalledWith(1, keygen, ['-Q', '-f', path.join('/tmp/ztk-revocation-test', 'revoked.krl'), publicKeyFile], expect.objectContaining({ shell: false, signal: expect.any(AbortSignal), maxBuffer: 1024 * 1024 }));
        expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/ztk-revocation-test', { recursive: true, force: true });
    });

    it.each([
        { status: 1, result: 'REVOKED', stderr: '' },
        { status: 1, result: 'ok', stderr: '' },
        { status: 2, result: 'ok', stderr: '' },
        { status: null, result: 'ok', stderr: '' },
        { status: 0, result: 'ok', stderr: 'invalid KRL' },
        { status: 0, result: 'unexpected', stderr: '' },
        { status: 0, result: 'ok\nadditional unexpected output', stderr: '' },
        { status: 0, result: 'ok', stderr: '', error: new Error('Timeout') }
    ])('rejects revoked keys or failed KRL queries and cleans up: %j', async query => {
        revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
        (queryResult as jest.Mock).mockReturnValueOnce({ ...query, stdout: `${path.join('/tmp/ztk-revocation-test', 'server.pub')}: ${query.result}` });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(queryResult).toHaveBeenCalledTimes(1);
        expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/ztk-revocation-test', { recursive: true, force: true });
    });

    it('rejects an empty successful KRL response', async () => {
        revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
        (queryResult as jest.Mock).mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        expect(fs.promises.rm).toHaveBeenCalled();
        expect(queryResult).toHaveBeenCalledTimes(1);
    });

    it('reports a comment-bearing OpenSSH revoked response and cleans up', async () => {
        revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
        const onFailure = jest.fn();
        (queryResult as jest.Mock).mockReturnValueOnce({ status: 1, stdout: `${path.join('/tmp/ztk-revocation-test', 'server.pub')} (ztk-host-key): REVOKED\n`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host, onFailure)(hostKey))).toBe(false);
        expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('host key is revoked') }));
        expect(fs.promises.rm).toHaveBeenCalled();
    });

    it.each(['directory', 'write', 'cleanup'])('rejects when KRL temporary %s operations fail', async operation => {
        revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
        const method = operation === 'directory' ? fs.promises.mkdtemp : operation === 'write' ? fs.promises.writeFile : fs.promises.rm;
        (method as jest.Mock).mockImplementation(() => { throw new Error(operation); });
        (queryResult as jest.Mock).mockReturnValueOnce({ status: 0, stdout: `${path.join('/tmp/ztk-revocation-test', 'server.pub')}: ok`, stderr: '' });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: '~/revoked_keys' }, host)(hostKey))).toBe(false);
        if (operation !== 'directory') expect(fs.promises.rm).toHaveBeenCalled();
    });

    it('does not ignore additional configured revocation files', async () => {
        (openRevocation as jest.Mock).mockReturnValueOnce(10).mockImplementationOnce(() => { throw new Error('Missing second file'); });
        expect((await createSSHHostVerifier({ host }, { RevokedHostKeys: ['~/first', '~/second'] }, host)(hostKey))).toBe(false);
        expect(openRevocation).toHaveBeenCalledTimes(2);
        expect(queryResult).not.toHaveBeenCalled();
    });

    it.each(['', [], ['none', '~/revoked']])('rejects invalid revocation configuration: %j', setting => {
        expect(() => createSSHHostVerifier({ host }, { RevokedHostKeys: setting }, host)).toThrow();
        expect(queryResult).not.toHaveBeenCalled();
    });

    it('rejects a pre-hashed key instead of comparing it as a raw public key', async () => {
        expect((await createSSHHostVerifier({ host }, null, host)('some-fingerprint'))).toBe(false);
    });

    it('reports an actionable verification error without throwing through the SSH event handler', async () => {
        (queryResult as jest.Mock).mockReturnValue({ status: 1, stdout: '', stderr: '' });
        const onFailure = jest.fn();
        expect((await createSSHHostVerifier({ host }, null, host, onFailure)(hostKey))).toBe(false);
        expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Verify the device fingerprint independently') }));
        expect(logger.error).toHaveBeenCalledWith('SSH host key verification failed', expect.objectContaining({ fingerprint: expect.stringMatching(/^SHA256:/) }));
    });

    describe('asynchronous resource budgets', () => {
        afterEach(() => {
            jest.useRealTimers();
            jest.restoreAllMocks();
        });

        it('keeps the event loop responsive during delayed preflight I/O', async () => {
            let finishOpen!: (descriptor: unknown) => void;
            (fs.promises.open as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finishOpen = resolve; }));
            const verifier = createVerifier({ host }, null, host);
            let completed = false;
            const preflight = preflightSSHHostVerifier(verifier).then(() => { completed = true; });
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(completed).toBe(false);
            finishOpen({ stat: async () => ({ isFile: () => true }), close: async () => closeFile(10) });
            await preflight;
            expect(closeFile).toHaveBeenCalled();
        });

        it('keeps the event loop responsive while waiting for an OpenSSH process', async () => {
            let finishQuery!: (error: null, stdout: string, stderr: string) => void;
            (execFile as unknown as jest.Mock).mockImplementation((_executable: unknown, _args: unknown, _options: unknown, callback: unknown) => {
                finishQuery = callback as typeof finishQuery;
                return {};
            });
            let completed = false;
            const verification = createSSHHostVerifier({ host }, null, host)(hostKey).then(result => { completed = true; return result; });
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(completed).toBe(false);
            finishQuery(null, entry, '');
            await expect(verification).resolves.toBe(true);
        });

        it.each([0, 16, 31])('counts known-hosts and revocations against one 32-source limit: %s known-hosts', count => {
            const files = Array.from({ length: count }, (_value, index) => `/trust/known_hosts_${index}`);
            const revocations = Array.from({ length: 32 - Math.max(count, 1) }, (_value, index) => `/trust/revoked_${index}`);
            const policy = { UserKnownHostsFile: count ? files : ['/trust/known_hosts'], GlobalKnownHostsFile: 'none', RevokedHostKeys: revocations };
            expect(() => createVerifier({ host }, policy, host)).not.toThrow();
            expect(() => createVerifier({ host }, { ...policy, RevokedHostKeys: [...revocations, '/trust/extra'] }, host)).toThrow('32 source limit');
            expect(fs.promises.open).not.toHaveBeenCalled();
            expect(execFile).not.toHaveBeenCalled();
        });

        it('shares the deadline across multiple known-hosts queries', async () => {
            let elapsed = 0;
            jest.spyOn(performance, 'now').mockImplementation(() => elapsed);
            exists.mockReturnValue(true);
            queryResult.mockImplementation(() => { elapsed += 3000; return { status: 0, stdout: entry, stderr: '' }; });
            const onFailure = jest.fn();
            expect(await createSSHHostVerifier({ host }, null, host, onFailure)(hostKey)).toBe(false);
            expect(queryResult).toHaveBeenCalledTimes(2);
            expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('aggregate deadline') }));
        });

        it('shares the deadline between preflight and verification', async () => {
            let elapsed = 0;
            jest.spyOn(performance, 'now').mockImplementation(() => elapsed);
            const verifier = createVerifier({ host }, null, host);
            await preflightSSHHostVerifier(verifier);
            elapsed = 5001;
            const callback = jest.fn();
            verifier(hostKey, callback);
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(callback.mock.calls).toEqual([[false]]);
            expect(execFile).not.toHaveBeenCalled();
        });

        it('shares the deadline across revocation sources without starting another read', async () => {
            let elapsed = 0;
            jest.spyOn(performance, 'now').mockImplementation(() => elapsed);
            readChunk.mockImplementation(() => { elapsed += 3000; return 0; });
            expect(await createSSHHostVerifier({ host }, { RevokedHostKeys: ['/first', '/second', '/third'] }, host)(hostKey)).toBe(false);
            expect(openRevocation).toHaveBeenCalledTimes(2);
            expect(execFile).not.toHaveBeenCalled();
        });

        it('bounds aggregate revocation bytes across files and each read to 64 KiB', async () => {
            jest.spyOn(performance, 'now').mockReturnValue(0);
            let bytesInSource = 0;
            fileStat.mockReturnValue({ isFile: () => true, size: 9 * 1024 * 1024 });
            readChunk.mockImplementation((_descriptor, buffer: Buffer) => {
                expect(buffer.length).toBeLessThanOrEqual(64 * 1024);
                if (bytesInSource >= 9 * 1024 * 1024) return 0;
                buffer.fill(32);
                buffer[0] = 35;
                buffer[buffer.length - 1] = 10;
                bytesInSource += buffer.length;
                return buffer.length;
            });
            const onFailure = jest.fn();
            expect(await createSSHHostVerifier({ host }, { RevokedHostKeys: ['/first', '/second'] }, host, onFailure)(hostKey)).toBe(false);
            expect(openRevocation).toHaveBeenCalledTimes(2);
            expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('16 MiB') }));
            expect(execFile).not.toHaveBeenCalled();
        });

        it('yields while parsing plaintext and checks the deadline before accepting trust', async () => {
            revocationContent('# comment\n'.repeat(5000));
            let elapsed = 0;
            jest.spyOn(performance, 'now').mockImplementation(() => elapsed);
            setImmediate(() => { elapsed = 5001; });
            expect(await createSSHHostVerifier({ host }, { RevokedHostKeys: '/revoked' }, host)(hostKey)).toBe(false);
            expect(execFile).not.toHaveBeenCalled();
        });

        it('reports timeout before denial exactly once and ignores late process success', async () => {
            jest.useFakeTimers({ doNotFake: ['setImmediate'] });
            let finishQuery!: (error: null, stdout: string, stderr: string) => void;
            let signal!: AbortSignal;
            const killed = jest.fn();
            (execFile as unknown as jest.Mock).mockImplementation((_executable: unknown, _args: unknown, options: unknown, callback: unknown) => {
                signal = (options as { signal: AbortSignal }).signal;
                signal.addEventListener('abort', killed);
                finishQuery = callback as typeof finishQuery;
                return {};
            });
            const order: string[] = [];
            const onFailure = jest.fn((error: Error) => { expect(error).toBeInstanceOf(SSHHostVerificationError); order.push('failure'); });
            const callback = jest.fn((_valid: boolean) => { order.push('denial'); });
            createVerifier({ host }, null, host, onFailure)(hostKey, callback);
            await new Promise<void>(resolve => setImmediate(resolve));
            await jest.advanceTimersByTimeAsync(5000);
            expect(signal.aborted).toBe(true);
            expect(killed).toHaveBeenCalledTimes(1);
            expect(order).toEqual(['failure', 'denial']);
            expect(callback.mock.calls).toEqual([[false]]);
            finishQuery(null, entry, '');
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(callback).toHaveBeenCalledTimes(1);
            expect(execFile).toHaveBeenCalledTimes(1);
            expect(execFile).toHaveBeenCalledWith(keygen, expect.any(Array), expect.objectContaining({ shell: false, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' }), expect.any(Function));
        });

        it('closes a descriptor whose open completes after the timeout', async () => {
            jest.useFakeTimers({ doNotFake: ['setImmediate'] });
            let finishOpen!: (descriptor: unknown) => void;
            (fs.promises.open as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finishOpen = resolve; }));
            const callback = jest.fn();
            createVerifier({ host }, { RevokedHostKeys: '/revoked' }, host)(hostKey, callback);
            await new Promise<void>(resolve => setImmediate(resolve));
            await jest.advanceTimersByTimeAsync(5000);
            expect(callback.mock.calls).toEqual([[false]]);
            const close = jest.fn(async () => {});
            const stat = jest.fn();
            finishOpen({ close, stat });
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(close).toHaveBeenCalledTimes(1);
            expect(stat).not.toHaveBeenCalled();
            expect(execFile).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('cleans a KRL temporary directory created after timeout without writing or launching processes', async () => {
            jest.useFakeTimers({ doNotFake: ['setImmediate'] });
            revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
            let finishDirectory!: (directory: string) => void;
            (fs.promises.mkdtemp as jest.Mock).mockImplementationOnce(() => new Promise<string>(resolve => { finishDirectory = resolve; }));
            const callback = jest.fn();
            createVerifier({ host }, { RevokedHostKeys: '/revoked' }, host)(hostKey, callback);
            await new Promise<void>(resolve => setImmediate(resolve));
            await jest.advanceTimersByTimeAsync(5000);
            expect(callback.mock.calls).toEqual([[false]]);
            finishDirectory('/tmp/late-directory');
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/late-directory', { recursive: true, force: true });
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
            expect(execFile).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('cleans up after a delayed KRL snapshot write and never launches another operation after expiry', async () => {
            jest.useFakeTimers({ doNotFake: ['setImmediate'] });
            revocationContent(Buffer.from('SSHKRL\n\0synthetic'));
            let finishWrite!: () => void;
            (fs.promises.writeFile as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve; }));
            const callback = jest.fn();
            createVerifier({ host }, { RevokedHostKeys: '/revoked' }, host)(hostKey, callback);
            await new Promise<void>(resolve => setImmediate(resolve));
            await jest.advanceTimersByTimeAsync(5000);
            expect(callback.mock.calls).toEqual([[false]]);
            finishWrite();
            await new Promise<void>(resolve => setImmediate(resolve));
            expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/ztk-revocation-test', { recursive: true, force: true });
            expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
            expect(execFile).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it.each(['stdout', 'stderr'])('fails closed on the bounded process %s buffer limit', async stream => {
            queryResult.mockReturnValue({ status: null, stdout: '', stderr: '', error: Object.assign(new Error(`${stream} maxBuffer exceeded`), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true }) });
            expect(await createSSHHostVerifier({ host }, null, host)(hostKey)).toBe(false);
            expect(execFile).toHaveBeenCalledWith(keygen, expect.any(Array), expect.objectContaining({ maxBuffer: 1024 * 1024, shell: false }), expect.any(Function));
        });

        it('rejects contradictory known-hosts exit status and output', async () => {
            queryResult.mockReturnValue({ status: 1, stdout: entry, stderr: '' });
            expect(await createSSHHostVerifier({ host }, null, host)(hostKey)).toBe(false);
        });
    });
});