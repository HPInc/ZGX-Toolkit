/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSSHConfig } from '../../utils/sshConfig';
import { Device } from '../../types/devices';
import { SSHHostVerificationError } from '../../utils/sshHostVerifier';
import { resolveSSHConfigIncludes } from '../../utils/sshConfigIncludes';
import * as SSHConfig from 'ssh-config';

jest.mock('node:fs', () => jest.requireActual('node:fs'));
jest.mock('node:os', () => ({ ...jest.requireActual<typeof import('node:os')>('node:os'), homedir: jest.fn() }));
jest.mock('ssh-config', () => jest.requireActual('ssh-config'));
jest.mock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const realOs = jest.requireActual<typeof import('node:os')>('node:os');
const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
const systemDirectory = realOs.platform() === 'win32'
    ? path.join(process.env.ProgramData || String.raw`C:\ProgramData`, 'ssh') : '/etc/ssh';
const systemConfigFile = path.join(systemDirectory, 'ssh_config');
const readFile = realFs.readFileSync;

function expectedLocalUsername(): string {
    if (realOs.platform() !== 'win32') return realOs.userInfo().username;
    const result = jest.requireActual<typeof import('node:child_process')>('node:child_process')
        .spawnSync(path.join(process.env.windir || String.raw`C:\Windows`, 'System32', 'whoami.exe'), [], { encoding: 'utf8', shell: false });
    const account = result.stdout.trim().toLowerCase();
    const [domain, username] = account.split('\\');
    return domain === realOs.hostname().toLowerCase() || account === 'nt authority\\system' ? username : account;
}

describe('SSH config Include resolution', () => {
    let home: string;
    let sshDirectory: string;
    const device = { host: 'qa-device', username: 'qa-user', port: 22 } as Device;

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(realOs.tmpdir(), 'ztk config includes-'));
        sshDirectory = path.join(home, '.ssh');
        fs.mkdirSync(sshDirectory);
        (os.homedir as jest.Mock).mockReturnValue(home);
        jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: fs.PathOrFileDescriptor, options?: unknown) => {
            if (String(filename) === systemConfigFile) {
                throw Object.assign(new Error('System configuration not found'), { code: 'ENOENT' });
            }
            return readFile(filename, options as BufferEncoding);
        }) as typeof fs.readFileSync);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(home, { recursive: true, force: true });
    });

    function writeConfig(filename: string, content: string): void {
        fs.writeFileSync(path.join(sshDirectory, filename), content);
    }

    function systemConfig(content: string): void {
        jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: fs.PathOrFileDescriptor, options?: unknown) =>
            String(filename) === systemConfigFile ? content : readFile(filename, options as BufferEncoding)) as typeof fs.readFileSync);
    }

    it('ignores ENOENT when both user and system configurations are missing', async () => {
        const parse = jest.spyOn(SSHConfig, 'parse');
        expect((await getSSHConfig(device))).toMatchObject({ host: device.host, username: device.username, port: 22 });
        expect(realFs.readFileSync).toHaveBeenCalledWith(path.join(sshDirectory, 'config'), 'utf-8');
        expect(realFs.readFileSync).toHaveBeenCalledWith(systemConfigFile, 'utf-8');
        expect(parse).not.toHaveBeenCalled();
    });

    describe.each(['user', 'system'])('%s configuration read failures', source => {
        it.each(['EACCES', 'EPERM', 'EIO', 'EISDIR', undefined])('rejects %s even when existsSync returns false', async code => {
            const userConfigFile = path.join(sshDirectory, 'config');
            const failedFile = source === 'user' ? userConfigFile : systemConfigFile;
            const failure = Object.assign(new Error('Configuration read failed'), { code });
            jest.spyOn(realFs, 'existsSync').mockReturnValue(false);
            const read = jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: fs.PathOrFileDescriptor) => {
                if (String(filename) === failedFile) throw failure;
                return 'Host qa-device\n  Port 2200\n';
            }) as typeof fs.readFileSync);

            await expect(getSSHConfig(device)).rejects.toThrow(SSHHostVerificationError);
            await expect(getSSHConfig(device)).rejects.toThrow(expect.objectContaining({
                message: expect.stringContaining('Unable to load SSH configuration safely'), cause: failure
            }));
            expect(read).toHaveBeenCalledWith(failedFile, 'utf-8');
            expect(realFs.existsSync).not.toHaveBeenCalled();
        });
    });

    it('loads system settings even when there is no user config', async () => {
        systemConfig('Host qa-device\n  HostName system.example\n  Port 2222\n');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'system.example', port: 2222 });
    });

    it('preserves user-first precedence while evaluating system Match with user context', async () => {
        writeConfig('config', 'Host qa-device\n  HostName user.example\n  User deploy\n  Port 2200\n');
        systemConfig('Host *\n  HostName system.example\n  Port 22\nMatch host user.example user deploy\n  IdentityFile ~/.ssh/system-key\n');
        writeConfig('system-key', 'synthetic private key');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'user.example', username: 'deploy', port: 2200, privateKey: Buffer.from('synthetic private key') });
    });

    it('rejects an unreadable system configuration rather than falling back to user config', async () => {
        writeConfig('config', 'Host *\n  Port 2200\n');
        systemConfig('');
        jest.spyOn(realFs, 'readFileSync').mockImplementation(((filename: fs.PathOrFileDescriptor, options?: unknown) => {
            if (String(filename) === systemConfigFile) throw new Error('System configuration permission denied');
            return readFile(filename, options as BufferEncoding);
        }) as typeof fs.readFileSync);
        await expect(getSSHConfig(device)).rejects.toThrow('System configuration permission denied');
    });

    it('resolves system-relative Includes from their own directory and shares user Match context', () => {
        const userFile = path.join(sshDirectory, 'config');
        writeConfig('config', 'Host qa-device\n  HostName user.example\n  User deploy\n');
        const systemRoot = path.join(home, 'system');
        fs.mkdirSync(systemRoot);
        fs.writeFileSync(path.join(systemRoot, 'ssh_config'), 'Match host user.example user deploy\n  Include policy.conf\n');
        fs.writeFileSync(path.join(systemRoot, 'policy.conf'), 'RevokedHostKeys /managed/revoked\n');
        const computed = resolveSSHConfigIncludes(SSHConfig.parse(fs.readFileSync(userFile, 'utf8')), device.host, userFile, device.username, [{
            config: SSHConfig.parse(fs.readFileSync(path.join(systemRoot, 'ssh_config'), 'utf8')),
            filename: path.join(systemRoot, 'ssh_config'), baseDirectory: systemRoot
        }]).compute(device.host, { ignoreCase: true, matchExec: false });
        expect(computed).toMatchObject({ revokedhostkeys: '/managed/revoked', hostname: 'user.example', user: 'deploy' });
    });

    it('resolves a relative Include at its original position with first-value precedence', async () => {
        writeConfig('config', 'Include device.conf\nHost *\n  HostName fallback.example\n  Port 22\n');
        writeConfig('device.conf', 'Host qa-device\n  HostName included.example\n  Port 2222\n');

        const config = (await getSSHConfig(device));

        expect(config.host).toBe('included.example');
        expect(config.port).toBe(2222);
        expect(config.hostVerifier).toEqual(expect.any(Function));
    });

    function computedConfig(host = device.host): Record<string, string | string[]> {
        const filename = path.join(sshDirectory, 'config');
        return resolveSSHConfigIncludes(SSHConfig.parse(fs.readFileSync(filename, 'utf8')), host, filename)
            .compute(host, { ignoreCase: true, matchExec: false });
    }

    it('selects a known-hosts policy from a matching originalhost section', () => {
        writeConfig('config', 'Match originalhost qa-device\n  UserKnownHostsFile ~/.ssh/matched-hosts\nMatch all\n  UserKnownHostsFile ~/.ssh/fallback-hosts\n');
        expect(computedConfig()).toMatchObject({ userknownhostsfile: '~/.ssh/matched-hosts' });
        expect(computedConfig('other-device')).toMatchObject({ userknownhostsfile: '~/.ssh/fallback-hosts' });
    });

    it('evaluates combined host and user conditions using earlier applicable settings', async () => {
        writeConfig('config', 'Host qa-device\n  HostName actual.example\n  User deploy\nMatch host actual.example user deploy\n  Port 2222\nMatch host qa-device\n  Port 9999\n');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'actual.example', username: 'deploy', port: 2222 });
    });

    it('uses the device username before any applicable User directive', async () => {
        writeConfig('config', 'Match user qa-user\n  Port 2222\nMatch all\n  Port 22\n');
        expect((await getSSHConfig(device)).port).toBe(2222);
        expect((await getSSHConfig({ ...device, username: 'another-user' })).port).toBe(22);
    });

    it('uses the local username only when there is no device or configured username', () => {
        const username = expectedLocalUsername();
        writeConfig('config', `Match user "${username}"\n  Port 2222\n`);
        expect(computedConfig()).toMatchObject({ port: '2222' });
    });

    it('does not allow later User or HostName values to overwrite earlier context', async () => {
        writeConfig('config', 'User first-user\nHostName first.example\nHost *\n  User later-user\n  HostName later.example\nMatch host first.example user first-user\n  Port 2222\n');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'first.example', username: 'first-user', port: 2222 });
    });

    it('ignores context settings in nonmatching Host and Match sections', async () => {
        writeConfig('config', 'Host other\n  HostName wrong.example\n  User wrong-user\nMatch originalhost other\n  HostName wrong.example\nMatch host qa-device user qa-user\n  Port 2222\n');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'qa-device', username: 'qa-user', port: 2222 });
    });

    it('updates username context after an earlier matched section sets User', async () => {
        writeConfig('config', 'Match originalhost qa-device\n  User deploy\nMatch user deploy\n  Port 2222\n');
        expect((await getSSHConfig(device))).toMatchObject({ username: 'deploy', port: 2222 });
    });

    it('expands HostName %h before matching and connecting', async () => {
        writeConfig('config', 'Host qa-device\n  HostName %h.example\nMatch host qa-device.example originalhost qa-device\n  Port 2222\n');
        expect((await getSSHConfig(device))).toMatchObject({ host: 'qa-device.example', port: 2222 });
    });

    it.each([
        ['host qa-*', 'qa-device', true],
        ['originalhost qa-*,!qa-device', 'qa-device', false],
        ['originalhost !other,*', 'qa-device', true],
        ['originalhost !other', 'qa-device', false],
        ['!originalhost other', 'qa-device', true],
        ['!originalhost qa-*', 'qa-device', false],
        ['originalhost qa-devic?', 'qa-devic', false],
        ['originalhost qa-devic?', 'qa-device', true],
        ['originalhost QA-DEVICE', 'qa-device', true],
        ['originalhost "qa-device,other"', 'other', true],
        ['originalhost qa-device user wrong-user', 'qa-device', false],
        ['!originalhost other !user wrong-user', 'qa-device', true]
    ] as const)('evaluates Match %s for %s as %s', async (condition, host, matched) => {
        writeConfig('config', `Match ${condition}\n  Port 2222\nMatch all\n  Port 22\n`);
        expect((await getSSHConfig({ ...device, host })).port).toBe(matched ? 2222 : 22);
    });

    it('keeps username conditions case-sensitive', async () => {
        writeConfig('config', 'User Deploy\nMatch user deploy\n  Port 9999\nMatch user Deploy\n  Port 2222\n');
        expect((await getSSHConfig(device)).port).toBe(2222);
    });

    it('matches localuser independently of the remote username', async () => {
        const username = expectedLocalUsername();
        writeConfig('config', `User remote-deploy\nMatch localuser "${username}" user remote-deploy\n  Port 2222\n`);
        expect((await getSSHConfig(device)).port).toBe(2222);
    });

    it.each([
        ['EXAMPLE\\QaUser\n', 'example\\qauser'],
        ['QA-PC\\QaUser\n', 'qauser'],
        ['NT AUTHORITY\\SYSTEM\n', 'system']
    ])('normalizes Windows identity %s like OpenSSH', async (account, expected) => {
        const osModule = jest.requireMock<typeof import('node:os')>('node:os');
        jest.spyOn(osModule, 'platform').mockReturnValue('win32');
        jest.spyOn(osModule, 'hostname').mockReturnValue('QA-PC');
        const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
        const spawn = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
            pid: 0, output: [], stdout: account, stderr: '', status: 0, signal: null
        });
        writeConfig('config', `Match localuser "${expected}" user qa-user\n  Port 2222\n`);
        expect((await getSSHConfig(device)).port).toBe(2222);
        expect(spawn).toHaveBeenCalledWith(expect.stringMatching(/System32[\\/]whoami\.exe$/), [], expect.objectContaining({ shell: false, timeout: 5000 }));
    });

    it.each(['failure', 'malformed'])('rejects Windows identity lookup %s rather than selecting a fallback policy', async failure => {
        const osModule = jest.requireMock<typeof import('node:os')>('node:os');
        jest.spyOn(osModule, 'platform').mockReturnValue('win32');
        const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
        jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
            pid: 0, output: [], stdout: failure === 'malformed' ? 'invalid' : '', stderr: '',
            status: failure === 'failure' ? 1 : 0, signal: null
        });
        writeConfig('config', 'Match localuser qa-user\n  UserKnownHostsFile none\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/Unable to determine Windows local username/);
    });

    it('treats directive and criterion names case-insensitively', async () => {
        writeConfig('config', 'hOsT qa-device\n  hOsTnAmE ACTUAL.EXAMPLE\n  uSeR deploy\nmAtCh HoSt actual.example UsEr deploy\n  Port 2222\n');
        expect((await getSSHConfig(device)).port).toBe(2222);
    });

    it('preserves first-value precedence and repeatable identities across Match sections', () => {
        writeConfig('config', 'Port 2200\nIdentityFile before\nMatch all\n  Port 2222\n  IdentityFile matched\nMatch originalhost other\n  IdentityFile skipped\nMatch all\n  IdentityFile after\n');
        expect(computedConfig()).toMatchObject({ port: '2200', identityfile: ['before', 'matched', 'after'] });
    });

    it('restores parent Match scope across nested and multiple included files', async () => {
        writeConfig('config', 'Match originalhost qa-device\n  Include first.conf second.conf\n  Port 2222\nMatch all\n  Port 22\n');
        writeConfig('first.conf', 'Include nested.conf\nMatch originalhost other\n  Port 9999\n');
        writeConfig('nested.conf', 'Match originalhost other\n  User wrong-user\n');
        writeConfig('second.conf', 'User deploy\n');
        expect((await getSSHConfig(device))).toMatchObject({ username: 'deploy', port: 2222 });
        expect((await getSSHConfig({ ...device, host: 'other-device' }))).toMatchObject({ username: 'qa-user', port: 22 });
    });

    it('retains settings established in an included file for later Match conditions', async () => {
        writeConfig('config', 'Include context.conf\nMatch host actual.example user deploy\n  Port 2222\n');
        writeConfig('context.conf', 'Host qa-device\n  HostName actual.example\n  User deploy\n');
        expect((await getSSHConfig(device)).port).toBe(2222);
    });

    it('does not read includes inside a nonmatching Match section', async () => {
        writeConfig('config', 'Match originalhost other\n  Include unsafe.conf\nMatch all\n  Port 2222\n');
        writeConfig('unsafe.conf', 'Match exec "echo unsafe"\n');
        expect((await getSSHConfig(device)).port).toBe(2222);
    });

    it.each(['exec "echo unsafe"', 'final', 'canonical', 'localnetwork 127.0.0.0/8', 'tagged qa', 'command true', 'unknown value', 'host other exec "echo unsafe"'])('rejects unsupported Match %s without executing commands', async condition => {
        writeConfig('config', `Match ${condition}\n  UserKnownHostsFile none\n`);
        const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
        const spawn = jest.spyOn(childProcess, 'spawnSync');
        await expect(getSSHConfig(device)).rejects.toThrow(SSHHostVerificationError);
        expect(spawn).not.toHaveBeenCalled();
    });

    it.each(['host', 'all host qa-device', 'host qa-device all', 'host qa-device,', 'user !'])('rejects malformed Match %s instead of omitting policy', async condition => {
        writeConfig('config', `Match ${condition}\n  UserKnownHostsFile none\n`);
        await expect(getSSHConfig(device)).rejects.toThrow(SSHHostVerificationError);
    });

    it('rejects tokenized usernames when evaluating Match user', async () => {
        writeConfig('config', 'User %u\nMatch user qa-user\n  UserKnownHostsFile none\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/Tokenized SSH User/);
    });

    it('keeps settings before Include and accumulates identity files in order', () => {
        writeConfig('config', 'User first\nIdentityFile before\nInclude device.conf\nIdentityFile after\n');
        writeConfig('device.conf', 'User second\nIdentityFile included\n');
        expect(computedConfig()).toMatchObject({ user: 'first', identityfile: ['before', 'included', 'after'] });
    });

    it('restores parent Host scope after each included file and nested Include', () => {
        writeConfig('config', 'Host qa-* !qa-excluded\n  Include first.conf second.conf\n  Port 2222\nHost other\n  User wrong\n');
        writeConfig('first.conf', 'Include nested.conf\nHost other\n  Port 9999\n');
        writeConfig('nested.conf', 'Host other\n  HostName wrong.example\n');
        writeConfig('second.conf', 'User included-user\n');
        expect(computedConfig()).toMatchObject({ user: 'included-user', port: '2222' });
        expect(computedConfig()).not.toHaveProperty('hostname');
        expect(computedConfig('qa-excluded')).toEqual({});
    });

    it('does not load files or leak included Host blocks from a nonmatching parent', () => {
        writeConfig('config', 'Host other\n  Include unsafe.conf\nHost qa-device\n  User correct\n');
        writeConfig('unsafe.conf', 'Host qa-device\n  User wrong\nMatch exec "echo unsafe"\n');
        expect(computedConfig()).toMatchObject({ user: 'correct' });
    });

    it('processes wildcard matches lexically and excludes dotfiles unless explicitly requested', () => {
        fs.mkdirSync(path.join(sshDirectory, 'parts'));
        writeConfig('config', 'Include parts/*.conf\n');
        writeConfig('parts/20.conf', 'Port 2220\n');
        writeConfig('parts/10.conf', 'Port 2210\n');
        writeConfig('parts/.00.conf', 'Port 2200\n');
        expect(computedConfig()).toMatchObject({ port: '2210' });
        writeConfig('config', 'Include parts/.*.conf\n');
        expect(computedConfig()).toMatchObject({ port: '2200' });
    });

    it('handles quoted paths and multiple arguments in argument order', () => {
        writeConfig('config', 'Include "second file.conf" "first file.conf"\n');
        writeConfig('first file.conf', 'Port 2201\n');
        writeConfig('second file.conf', 'Port 2202\nUser quoted-user\n');
        expect(computedConfig()).toMatchObject({ port: '2202', user: 'quoted-user' });
    });

    it.each(['~/.ssh/parts/outer.conf', '%d/.ssh/parts/outer.conf', 'absolute'])('resolves %s and anchors nested relative paths at ~/.ssh', form => {
        fs.mkdirSync(path.join(sshDirectory, 'parts'));
        const includePath = form === 'absolute' ? path.join(sshDirectory, 'parts', 'outer.conf').replace(/\\/g, '/') : form;
        writeConfig('config', `Include "${includePath}"\n`);
        writeConfig('parts/outer.conf', 'Include inner.conf\n');
        writeConfig('inner.conf', 'Host qa-device\n  HostKeyAlias enrolled-device\n  UserKnownHostsFile ~/.ssh/custom-hosts\n  GlobalKnownHostsFile none\n');
        expect(computedConfig()).toMatchObject({
            hostkeyalias: 'enrolled-device', userknownhostsfile: '~/.ssh/custom-hosts', globalknownhostsfile: 'none'
        });
    });

    it('expands environment variables and literal percent tokens without a shell', () => {
        process.env.ZTK_INCLUDE_QA = sshDirectory.replace(/\\/g, '/');
        try {
            writeConfig('config', 'Include "${ZTK_INCLUDE_QA}/literal%%.conf"\n');
            writeConfig('literal%.conf', 'Port 2222\n');
            expect(computedConfig()).toMatchObject({ port: '2222' });
        } finally {
            delete process.env.ZTK_INCLUDE_QA;
        }
    });

    it('ignores unmatched wildcard and missing literal Include paths', () => {
        writeConfig('config', 'Include missing.conf absent/*.conf\nHost qa-device\n  Port 2222\n');
        expect(computedConfig()).toMatchObject({ port: '2222' });
    });

    it('allows a repeated include after the previous expansion has completed', () => {
        writeConfig('config', 'Include identity.conf identity.conf\n');
        writeConfig('identity.conf', 'IdentityFile qa-key\n');
        expect(computedConfig()).toMatchObject({ identityfile: ['qa-key', 'qa-key'] });
    });

    it.each(['config', 'loop.conf'])('rejects an Include cycle through %s', async target => {
        writeConfig('config', 'Include loop.conf\n');
        writeConfig('loop.conf', `Include ${target}\n`);
        await expect(getSSHConfig(device)).rejects.toThrow(/cycle detected/);
    });

    it('rejects cycles through a directory symlink', async () => {
        fs.symlinkSync(sshDirectory, path.join(sshDirectory, 'alias'), realOs.platform() === 'win32' ? 'junction' : 'dir');
        writeConfig('config', 'Include alias/config\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/cycle detected/);
    });

    it('rejects excessive include depth', async () => {
        writeConfig('config', 'Include depth0.conf\n');
        for (let index = 0; index < 18; index++) writeConfig(`depth${index}.conf`, `Include depth${index + 1}.conf\n`);
        await expect(getSSHConfig(device)).rejects.toThrow(/resolution limit exceeded/);
    });

    it('allows exactly sixteen included levels', () => {
        writeConfig('config', 'Include depth0.conf\n');
        for (let index = 0; index < 15; index++) writeConfig(`depth${index}.conf`, `Include depth${index + 1}.conf\n`);
        writeConfig('depth15.conf', 'Port 2222\n');
        expect(computedConfig()).toMatchObject({ port: '2222' });
    });

    it('supports question-mark and character-class filesystem patterns', () => {
        fs.mkdirSync(path.join(sshDirectory, 'parts'));
        writeConfig('config', 'Include parts/[12]?.conf\n');
        writeConfig('parts/20.conf', 'Port 2220\n');
        writeConfig('parts/10.conf', 'Port 2210\n');
        writeConfig('parts/30.conf', 'Port 2230\n');
        expect(computedConfig()).toMatchObject({ port: '2210' });
    });

    it('rejects excessive repeated include expansion', async () => {
        writeConfig('config', `Include ${Array.from({ length: 257 }, () => 'empty.conf').join(' ')}\n`);
        writeConfig('empty.conf', '');
        await expect(getSSHConfig(device)).rejects.toThrow(/resolution limit exceeded/);
    });

    it('rejects oversized includes before reading their contents', async () => {
        writeConfig('config', 'Include large.conf\n');
        writeConfig('large.conf', '#'.repeat(4 * 1024 * 1024 + 1));
        await expect(getSSHConfig(device)).rejects.toThrow(/size limit/);
    });

    it('rejects directories rather than silently omitting their policy', async () => {
        fs.mkdirSync(path.join(sshDirectory, 'directory.conf'));
        writeConfig('config', 'Include directory.conf\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/not a regular file/);
    });

    it('fails closed when an included file cannot be read', async () => {
        writeConfig('config', 'Include unreadable.conf\n');
        writeConfig('unreadable.conf', 'Port 2222\n');
        jest.spyOn(jest.requireActual<typeof import('node:fs')>('node:fs'), 'readFileSync').mockImplementation((filename, options) => {
            if (String(filename).endsWith('unreadable.conf')) throw new Error('EACCES');
            if (String(filename) === systemConfigFile) {
                throw Object.assign(new Error('System configuration not found'), { code: 'ENOENT' });
            }
            return readFile(filename, options);
        });
        await expect(getSSHConfig(device)).rejects.toThrow(/unreadable.conf.*EACCES/);
    });

    it.each(['%h.conf', '%%%.conf', '~another-user/config', '${ZTK_MISSING_INCLUDE_QA}/config'])('rejects unresolved Include path %s', async includePath => {
        delete process.env.ZTK_MISSING_INCLUDE_QA;
        writeConfig('config', `Include ${includePath}\n`);
        await expect(getSSHConfig(device)).rejects.toThrow(SSHHostVerificationError);
    });

    it('retains fail-closed handling for an included Match condition', async () => {
        writeConfig('config', 'Include conditional.conf\n');
        writeConfig('conditional.conf', 'Match exec "echo unsafe"\n  UserKnownHostsFile none\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/Unsupported SSH Match criterion exec/);
    });

    it('rejects unresolved hostname canonicalization instead of omitting its second-pass policy', async () => {
        writeConfig('config', 'Include canonical.conf\n');
        writeConfig('canonical.conf', 'Host *\n  CanonicalizeHostname yes\n');
        await expect(getSSHConfig(device)).rejects.toThrow(/hostname canonicalization cannot be safely resolved/);
    });

    const sshCandidates = realOs.platform() === 'win32'
        ? [path.join(process.env.windir || String.raw`C:\Windows`, 'System32', 'OpenSSH', 'ssh.exe')]
        : ['/usr/bin/ssh', '/bin/ssh'];
    const ssh = sshCandidates.find(candidate => fs.existsSync(candidate));
    (ssh ? it.each : it.skip.each)([
        'originalhost qa-device',
        'host actual.example user deploy',
        'host qa-device',
        'host *.example,!actual.example',
        '!host wrong.example !user other',
        'originalhost qa-devic?',
        'originalhost qa-device?',
        'user Deploy',
        `localuser "${expectedLocalUsername()}" user deploy`,
        'all'
    ])('matches OpenSSH evaluation of Match %s for synthetic config', condition => {
        writeConfig('config', `Host qa-device\n  HostName actual.example\n  User deploy\nMatch ${condition}\n  UserKnownHostsFile selected-hosts\nMatch all\n  UserKnownHostsFile fallback-hosts\n`);
        const result = jest.requireActual<typeof import('node:child_process')>('node:child_process')
            .spawnSync(ssh!, ['-G', '-F', path.join(sshDirectory, 'config'), device.host], { encoding: 'utf8', timeout: 5000, shell: false });
        expect(result.status).toBe(0);
        const trustLine = result.stdout.split(/\r?\n/).find(line => line.startsWith('userknownhostsfile '));
        expect(computedConfig().userknownhostsfile).toBe(trustLine?.slice('userknownhostsfile '.length));
    });
    (ssh ? it.each : it.skip.each)(['Host qa-device', 'Match originalhost qa-device'])('matches OpenSSH scope restoration and first-value precedence for %s', section => {
        const absolutePath = (filename: string) => path.join(sshDirectory, filename).replace(/\\/g, '/');
        writeConfig('config', `${section}\n  Include "${absolutePath('first.conf')}" "${absolutePath('second.conf')}"\n  Port 2222\nHost *\n  User fallback\n`);
        writeConfig('first.conf', 'Match originalhost other\n  Port 9999\n  User wrong\n');
        writeConfig('second.conf', 'HostName included.example\nUser included-user\n');
        const result = jest.requireActual<typeof import('node:child_process')>('node:child_process')
            .spawnSync(ssh!, ['-G', '-F', absolutePath('config'), device.host], { encoding: 'utf8', timeout: 5000, shell: false });
        expect(result.status).toBe(0);
        const openSSH = Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line => {
            const separator = line.indexOf(' ');
            return [line.slice(0, separator), line.slice(separator + 1)];
        }));
        const resolved = computedConfig();
        expect(resolved).toMatchObject({ hostname: openSSH.hostname, user: openSSH.user, port: openSSH.port });
    });
});