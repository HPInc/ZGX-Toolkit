/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TextDecoder } from 'node:util';
import { CipherAlgorithm, ConnectConfig, KexAlgorithm, MacAlgorithm, ServerHostKeyAlgorithm, utils } from 'ssh2';
import { logger } from './logger';

type HostConfig = Record<string, string | string[]>;

export const SSH_HOST_VERIFICATION_GUIDANCE = 'Device identity could not be verified. No password was sent. Verify the device\'s SSH host-key fingerprint through a trusted channel before updating its known-hosts entry.';

export class SSHHostVerificationError extends Error {
    /** Identifies trust failures so callers can stop retries and credential prompts. */
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SSHHostVerificationError';
    }
}

/** Looks up an SSH directive without depending on its capitalization. */
function hostOption(hostConfig: HostConfig | null, name: string): string | string[] | undefined {
    return Object.entries(hostConfig || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

/** Selects the first value for a single-valued SSH directive. */
function firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

const SUPPORTED_HOST_KEY_ALGORITHMS: readonly ServerHostKeyAlgorithm[] = [
    'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
    'rsa-sha2-512', 'rsa-sha2-256'
];

const SUPPORTED_CIPHERS: readonly CipherAlgorithm[] = [
    'chacha20-poly1305@openssh.com', 'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com',
    'aes128-ctr', 'aes192-ctr', 'aes256-ctr'
];
const SUPPORTED_KEX: readonly KexAlgorithm[] = [
    'curve25519-sha256', 'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group16-sha512',
    'diffie-hellman-group17-sha512', 'diffie-hellman-group18-sha512'
];
const SUPPORTED_MACS: readonly MacAlgorithm[] = [
    'hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256', 'hmac-sha2-512'
];

function algorithmPolicy<Algorithm extends string>(hostConfig: HostConfig | null, setting: string, supported: readonly Algorithm[]): Algorithm[] | undefined {
    const configured = hostOption(hostConfig, setting);
    if (configured === undefined) return undefined;
    if (typeof configured !== 'string') throw new SSHHostVerificationError(`Invalid ${setting} policy`);
    const algorithms = configured.split(',');
    if (algorithms.some(algorithm => !supported.includes(algorithm as Algorithm))) {
        throw new SSHHostVerificationError(`Unsupported ${setting} policy; toolkit connections require an explicit comma-separated list of supported algorithms (no modifiers, patterns, or certificates)`);
    }
    return algorithms as Algorithm[];
}

function rejectConnectionPolicies(hostConfig: HostConfig | null): void {
    const refusal = hostOption(hostConfig, 'RefuseConnection');
    if (refusal !== undefined) {
        throw new SSHHostVerificationError(`OpenSSH RefuseConnection denies this connection: ${firstValue(refusal) || 'connection refused'}`);
    }
    for (const setting of ['ProxyCommand', 'ProxyJump', 'KnownHostsCommand']) {
        const value = hostOption(hostConfig, setting);
        if (value !== undefined && (typeof value !== 'string' || value.toLowerCase() !== 'none')) {
            throw new SSHHostVerificationError(`OpenSSH ${setting} is not supported for toolkit connections except none; refusing to ignore its policy`);
        }
    }
}

/** Applies implemented negotiation policy and refuses unsupported trust semantics. */
function applyHostKeyPolicies(config: ConnectConfig, hostConfig: HostConfig | null): void {
    rejectConnectionPolicies(hostConfig);
    const disabledPolicies = ['CheckHostIP', 'VerifyHostKeyDNS', 'UpdateHostKeys'];
    for (const setting of disabledPolicies) {
        const value = hostOption(hostConfig, setting);
        if (value !== undefined && (typeof value !== 'string' || value.toLowerCase() !== 'no')) {
            throw new SSHHostVerificationError(`OpenSSH ${setting} is not supported for toolkit connections except no; refusing to ignore its policy`);
        }
    }
    for (const setting of ['RequiredRSASize', 'CASignatureAlgorithms', 'RekeyLimit']) {
        if (hostOption(hostConfig, setting) !== undefined) {
            throw new SSHHostVerificationError(`OpenSSH ${setting} is not supported for toolkit connections; refusing to ignore its policy`);
        }
    }
    const serverHostKey = algorithmPolicy(hostConfig, 'HostKeyAlgorithms', SUPPORTED_HOST_KEY_ALGORITHMS);
    const cipher = algorithmPolicy(hostConfig, 'Ciphers', SUPPORTED_CIPHERS);
    const kex = algorithmPolicy(hostConfig, 'KexAlgorithms', SUPPORTED_KEX);
    const hmac = algorithmPolicy(hostConfig, 'MACs', SUPPORTED_MACS);
    if (serverHostKey || cipher || kex || hmac) {
        config.algorithms = {
            ...config.algorithms,
            ...(serverHostKey ? { serverHostKey } : {}),
            ...(cipher ? { cipher } : {}),
            ...(kex ? { kex } : {}),
            ...(hmac ? { hmac } : {})
        };
    }
}

/** Uses only the system OpenSSH installation, avoiding executable lookup through PATH. */
async function resolveKeygen(budget: VerificationBudget): Promise<string> {
    const candidates = os.platform() === 'win32'
        ? [path.join(process.env.windir || String.raw`C:\Windows`, 'System32', 'OpenSSH', 'ssh-keygen.exe')]
        : ['/usr/bin/ssh-keygen', '/bin/ssh-keygen'];
    for (const executable of candidates) {
        budget.check();
        try {
            await fs.promises.access(executable, fs.constants.X_OK);
            budget.check();
            return executable;
        } catch (error) {
            budget.check();
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
    throw new Error('A system OpenSSH ssh-keygen executable is required to verify SSH host keys');
}

/** Expands supported trust-file paths and rejects unresolved tokens or environment variables. */
function expandKnownHostsPath(value: string, tokens: ReadonlyMap<string, string>, setting = 'known-hosts'): string {
    if (/^~[^\\/]/.test(value)) {
        throw new Error(`Named-user home directories are not supported in ${setting} paths`);
    }
    const expanded = value.replaceAll(/%(.)?/g, token => {
        const replacement = tokens.get(token);
        if (replacement === undefined) {
            throw new Error(`Unsupported ${setting} path token: ${token}`);
        }
        return replacement;
    }).replaceAll(/\$\{([^}]+)\}/g, (_match, name: string) => {
        const replacement = process.env[name];
        if (replacement === undefined) {
            throw new Error(`Undefined environment variable in ${setting} path: ${name}`);
        }
        return replacement;
    }).replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
}

/** Resolves configured user/global trust files, using defaults only when directives are absent. */
function knownHostsFiles(hostConfig: HostConfig | null, tokens: ReadonlyMap<string, string>): string[] {
    const systemDirectory = os.platform() === 'win32'
        ? path.join(process.env.ProgramData || String.raw`C:\ProgramData`, 'ssh')
        : '/etc/ssh';
    const userDefaults = [path.join(os.homedir(), '.ssh', 'known_hosts'), path.join(os.homedir(), '.ssh', 'known_hosts2')];
    const globalDefaults = [path.join(systemDirectory, 'ssh_known_hosts'), path.join(systemDirectory, 'ssh_known_hosts2')];
    const defaults = [userDefaults, globalDefaults];
    const files = (['UserKnownHostsFile', 'GlobalKnownHostsFile'] as const).flatMap((setting, index) => {
        const configured = hostOption(hostConfig, setting);
        let values = defaults[index];
        if (configured !== undefined) {
            values = Array.isArray(configured) ? configured : [configured];
        }
        if (values.length > MAX_TRUST_SOURCES) throw new Error('SSH host trust exceeds the aggregate 32 source limit');
        if (!values.length || values.some(value => !value.trim()) || (values.length > 1 && values.some(value => value.toLowerCase() === 'none'))) {
            throw new Error(`Invalid ${setting} policy`);
        }
        return values.filter(value => value.toLowerCase() !== 'none').map(value => expandKnownHostsPath(value, tokens));
    });
    return [...new Set(files)];
}

const MAX_REVOCATION_BYTES = 16 * 1024 * 1024;
const MAX_TRUST_SOURCES = 32;
const VERIFICATION_TIMEOUT_MS = 5000;
const KRL_MAGIC = Buffer.from('SSHKRL\n\0', 'ascii');

class VerificationBudget {
    readonly controller = new AbortController();
    private deadline?: number;
    bytes = 0;

    check(): void {
        this.deadline ??= performance.now() + VERIFICATION_TIMEOUT_MS;
        if (this.controller.signal.aborted || performance.now() >= this.deadline) {
            this.controller.abort();
            throw new Error('SSH host verification aggregate deadline exceeded');
        }
    }

    async run<Result>(operation: () => Promise<Result>): Promise<Result> {
        this.check();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                operation().then(result => { this.check(); return result; }),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => {
                        this.controller.abort();
                        reject(new Error('SSH host verification aggregate deadline exceeded'));
                    }, Math.max(0, this.deadline! - performance.now()));
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async yield(): Promise<void> {
        await new Promise<void>(resolve => setImmediate(resolve));
        this.check();
    }
}

function queryKeygen(executable: string, args: string[], budget: VerificationBudget): Promise<{ status: number; stdout: string; stderr: string }> {
    budget.check();
    return new Promise((resolve, reject) => {
        const child = execFile(executable, args, {
            encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true, shell: false,
            signal: budget.controller.signal, killSignal: 'SIGKILL'
        }, (error, stdout, stderr) => {
            try {
                budget.check();
                if (error && (error.code !== 1 || error.killed || error.signal)) throw error;
                resolve({ status: error ? 1 : 0, stdout, stderr });
            } catch (error_) {
                if (child?.exitCode === null && child.signalCode === null) {
                    child.once('close', () => reject(error_));
                } else {
                    reject(error_);
                }
            }
        });
    });
}

const preflights = new WeakMap<NonNullable<ConnectConfig['hostVerifier']>, () => Promise<void>>();

export async function preflightSSHHostVerifier(verifier: NonNullable<ConnectConfig['hostVerifier']>): Promise<void> {
    const preflight = preflights.get(verifier);
    if (!preflight) throw new SSHHostVerificationError('Missing SSH host trust preflight');
    await preflight();
}

/** Removes trailing Base64 padding with a linear scan, without regex backtracking. */
function withoutBase64Padding(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === '=') end--;
    return value.slice(0, end);
}

/** Reads a bounded snapshot of a regular revocation file and always closes its descriptor. */
async function readRevocationFile(filename: string, budget: VerificationBudget): Promise<Buffer> {
    // Nonblocking open prevents a FIFO from hanging before the regular-file check.
    budget.check();
    const descriptor = await fs.promises.open(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    try {
        budget.check();
        const metadata = await descriptor.stat();
        budget.check();
        if (!metadata.isFile() || metadata.size > MAX_REVOCATION_BYTES - budget.bytes) {
            throw new Error('Revocation source is not a regular file or exceeds the 16 MiB limit');
        }
        const chunks: Buffer[] = [];
        // Enforce the limit while reading too, in case the file grows after stat.
        for (;;) {
            budget.check();
            const chunk = Buffer.alloc(Math.min(64 * 1024, MAX_REVOCATION_BYTES - budget.bytes + 1));
            const { bytesRead: count } = await descriptor.read(chunk, 0, chunk.length, null);
            budget.check();
            if (!count) break;
            budget.bytes += count;
            if (budget.bytes > MAX_REVOCATION_BYTES) throw new Error('Revocation sources exceed the aggregate 16 MiB limit');
            chunks.push(chunk.subarray(0, count));
        }
        return Buffer.concat(chunks);
    } finally {
        await descriptor.close();
    }
}

/** Queries a snapshot KRL and removes temporary files before verification can succeed. */
async function checkKrl(content: Buffer, key: Buffer, type: string, executable: string, budget: VerificationBudget): Promise<void> {
    budget.check();
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ztk-revocation-'));
    try {
        budget.check();
        const snapshotFile = path.join(directory, 'revoked.krl');
        const publicKeyFile = path.join(directory, 'server.pub');
        await fs.promises.writeFile(snapshotFile, content, { mode: 0o600, flag: 'wx' });
        budget.check();
        await fs.promises.writeFile(publicKeyFile, `${type} ${key.toString('base64')} ztk-host-key\n`, { mode: 0o600, flag: 'wx' });
        const query = await queryKeygen(executable, ['-Q', '-f', snapshotFile, publicKeyFile], budget);
        const output = query.stdout?.trim();
        // The fixed key comment makes OpenSSH's optional comment-bearing output predictable.
        const matchesResult = (result: string) => output === `${publicKeyFile}: ${result}` || output === `${publicKeyFile} (ztk-host-key): ${result}`;
        if (query.status === 1 && !query.stderr.trim() && matchesResult('REVOKED')) {
            throw new Error('The presented SSH host key is revoked');
        }
        if (query.status !== 0 || query.stderr.trim() || !matchesResult('ok')) {
            throw new Error('Unable to complete OpenSSH KRL query');
        }
    } finally {
        await fs.promises.rm(directory, { recursive: true, force: true });
    }
}

/** Validates a plaintext list entry and returns its exact public-key bytes. */
function parseRevokedKey(entry: string, lineNumber: number): Buffer {
    const fields = entry.split(/\s+/);
    const encoded = fields[1];
    const parsed = utils.parseKey(entry);
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
        || withoutBase64Padding(Buffer.from(encoded, 'base64').toString('base64')) !== withoutBase64Padding(encoded)
        || parsed instanceof Error || Array.isArray(parsed) || parsed.type !== fields[0]
        || !parsed.getPublicSSH().equals(Buffer.from(encoded, 'base64'))) {
        throw new Error(`Malformed revoked public key at line ${lineNumber}`);
    }
    return parsed.getPublicSSH();
}

/** Checks every noncomment plaintext row; malformed rows block trust rather than being skipped. */
async function checkPlaintextRevocations(content: Buffer, key: Buffer, budget: VerificationBudget): Promise<void> {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = '';
    let lineNumber = 0;
    for (let offset = 0; offset <= content.length; offset += 64 * 1024) {
        await budget.yield();
        const end = Math.min(offset + 64 * 1024, content.length);
        pending += decoder.decode(content.subarray(offset, end), { stream: end < content.length });
        let newline: number;
        while ((newline = pending.indexOf('\n')) !== -1) {
            const entry = pending.slice(0, newline).trim();
            pending = pending.slice(newline + 1);
            lineNumber++;
            if (entry.length > 64 * 1024) throw new Error('Revocation row exceeds the 64 KiB limit');
            if (entry && !entry.startsWith('#') && parseRevokedKey(entry, lineNumber).equals(key)) throw new Error('The presented SSH host key is revoked');
            if (lineNumber % 64 === 0) await budget.yield();
        }
        if (pending.length > 64 * 1024) throw new Error('Revocation row exceeds the 64 KiB limit');
        if (end === content.length) break;
    }
    const entry = pending.trim();
    budget.check();
    if (entry && !entry.startsWith('#') && parseRevokedKey(entry, lineNumber + 1).equals(key)) throw new Error('The presented SSH host key is revoked');
}

/** Dispatches by file format and preserves the source path in any verification failure. */
async function checkRevocationFile(filename: string, key: Buffer, type: string, executable: string, budget: VerificationBudget): Promise<void> {
    try {
        const content = await readRevocationFile(filename, budget);
        if (content.subarray(0, KRL_MAGIC.length).equals(KRL_MAGIC)) {
            // OpenSSH queries binary KRLs; a snapshot avoids rereading a changed source file.
            await checkKrl(content, key, type, executable, budget);
        } else {
            await checkPlaintextRevocations(content, key, budget);
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`RevokedHostKeys check failed for ${filename}: ${reason}`, { cause: error });
    }
}

/** Rejects revoked keys and any configured revocation source that cannot be checked safely. */
function revokedHostFiles(hostConfig: HostConfig | null, tokens: ReadonlyMap<string, string>): string[] {
    const configured = hostOption(hostConfig, 'RevokedHostKeys');
    if (configured === undefined) return [];
    const values = Array.isArray(configured) ? configured : [configured];
    if (values.length > MAX_TRUST_SOURCES) throw new Error('SSH host trust exceeds the aggregate 32 source limit');
    if (values.length === 1 && values[0].toLowerCase() === 'none') return [];
    if (!values.length || values.some(value => !value || value.toLowerCase() === 'none')) {
        throw new Error('Invalid RevokedHostKeys file configuration');
    }
    return values.map(value => expandKnownHostsPath(value, tokens, 'RevokedHostKeys'));
}

/** Accepts only an unmarked matching leaf key; revocation always throws. */
function matchesKnownHostEntry(line: string, filename: string, presentedKey: string, type: string): boolean {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) return false;
    const fields = entry.split(/\s+/);
    const marker = fields[0].startsWith('@') ? fields.shift() : undefined;
    if (fields.length < 3) throw new Error(`Malformed known-hosts entry in ${filename}`);
    if (fields[2] !== presentedKey) return false;
    if (marker === '@revoked') throw new Error('The presented SSH host key is revoked');
    return marker === undefined && fields[1] === type;
}

/** Delegates hashed-hostname and pattern matching to OpenSSH, then compares exact key bytes. */
async function trustedKeyInFile(filename: string, lookupHost: string, key: Buffer, type: string, executable: string, budget: VerificationBudget): Promise<boolean> {
    if (!await readableTrustFile(filename, budget)) return false;
    const lookup = await queryKeygen(executable, ['-F', lookupHost, '-f', filename], budget);
    if (lookup.stderr.trim() || (lookup.status !== 0 && lookup.status !== 1) || (lookup.status === 1 && lookup.stdout.trim())) {
        throw new Error(`Unable to read SSH host trust from ${filename}`);
    }
    const presentedKey = key.toString('base64');
    let trusted = false;
    for (const [index, line] of lookup.stdout.split(/\r?\n/).entries()) {
        if (index % 64 === 0) await budget.yield();
        // Keep scanning: a later entry may revoke this same key.
        trusted = matchesKnownHostEntry(line, filename, presentedKey, type) || trusted;
    }
    return trusted;
}

async function readableTrustFile(filename: string, budget: VerificationBudget): Promise<boolean> {
    try {
        budget.check();
        const descriptor = await fs.promises.open(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
        try {
            budget.check();
            const metadata = await descriptor.stat();
            budget.check();
            if (!metadata.isFile()) throw new Error(`SSH host trust source is not a regular file: ${filename}`);
        } finally {
            await descriptor.close();
        }
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
        throw new Error(`Unable to read SSH host trust from ${filename}`, { cause: error });
    }
}

/** Applies configured revocation and checks every trust file before accepting enrollment. */
async function verifyPresentedKey(key: Buffer | string, lookupHost: string, files: readonly string[], revocations: readonly string[], budget: VerificationBudget): Promise<void> {
    if (!Buffer.isBuffer(key) || key.length === 0) {
        throw new Error('SSH host verification requires the raw server public key');
    }
    const executable = await resolveKeygen(budget);
    const parsedKey = utils.parseKey(key);
    if (parsedKey instanceof Error || Array.isArray(parsedKey)) throw new Error('Invalid SSH server public key');
    // Revocation takes precedence over enrollment, including entries already trusted locally.
    for (const filename of revocations) await checkRevocationFile(filename, key, parsedKey.type, executable, budget);
    let trusted = false;
    for (const filename of files) {
        trusted = await trustedKeyInFile(filename, lookupHost, key, parsedKey.type, executable, budget) || trusted;
    }
    if (!trusted) {
        throw new Error('SSH host key is unknown or has changed. Verify the device fingerprint independently and enroll it using OpenSSH before retrying');
    }
}

/** Creates an ssh2 raw-key verifier that requires enrollment before authentication can proceed. */
export function createSSHHostVerifier(
    config: ConnectConfig,
    hostConfig: HostConfig | null,
    originalHost: string,
    onFailure?: (error: Error) => void
): (key: Buffer | string, verify: (valid: boolean) => void) => void {
    applyHostKeyPolicies(config, hostConfig);
    const host = config.host || originalHost;
    const port = config.port || 22;
    const alias = firstValue(hostOption(hostConfig, 'HostKeyAlias'));
    // HostKeyAlias is used verbatim; ordinary hosts use OpenSSH's nondefault-port notation.
    const hostWithPort = port === 22 ? host.toLowerCase() : `[${host.toLowerCase()}]:${port}`;
    const lookupHost = alias || hostWithPort;
    const tokens = new Map([
        ['%%', '%'], ['%d', os.homedir()], ['%h', host], ['%n', originalHost],
        ['%p', String(port)], ['%r', config.username || ''], ['%k', alias || originalHost]
    ]);
    let files: string[];
    let revocations: string[];
    const budget = new VerificationBudget();
    try {
        files = knownHostsFiles(hostConfig, tokens);
        if (!files.length) throw new Error('All SSH known-hosts sources are disabled');
        revocations = revokedHostFiles(hostConfig, tokens);
        if (files.length + revocations.length > MAX_TRUST_SOURCES) throw new Error('SSH host trust exceeds the aggregate 32 source limit');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new SSHHostVerificationError(`Unable to resolve SSH host trust safely: ${message}`, { cause: error });
    }

    const verifier = (key: Buffer | string, verify: (valid: boolean) => void): void => {
        const fingerprint = Buffer.isBuffer(key)
            ? `SHA256:${withoutBase64Padding(createHash('sha256').update(key).digest('base64'))}`
            : undefined;
        const deny = (error: unknown): void => {
            // Report a typed failure and deny the handshake rather than throwing through ssh2's callback.
            const message = error instanceof Error ? error.message : String(error);
            logger.error('SSH host key verification failed', {
                host: lookupHost,
                fingerprint,
                error: message
            });
            const fingerprintDetails = fingerprint ? ` (${fingerprint})` : '';
            try {
                onFailure?.(new SSHHostVerificationError(`SSH host key verification failed for ${lookupHost}${fingerprintDetails}: ${message}`, { cause: error }));
            } catch {
                budget.controller.abort();
            } finally {
                verify(false);
            }
        };
        void budget.run(() => verifyPresentedKey(key, lookupHost, files, revocations, budget)).then(() => {
            try {
                budget.check();
            } catch (error) {
                deny(error);
                return;
            }
            verify(true);
        }, deny);
    };
    preflights.set(verifier, async () => {
        try {
            await budget.run(async () => {
                for (const filename of files) await readableTrustFile(filename, budget);
            });
        } catch (error) {
            throw new SSHHostVerificationError(`Unable to resolve SSH host trust safely: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    });
    return verifier;
}