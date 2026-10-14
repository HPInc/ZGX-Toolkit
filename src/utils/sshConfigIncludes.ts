/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { globSync } from 'tinyglobby';
import * as SSHConfig from 'ssh-config';
import { SSHHostVerificationError } from './sshHostVerifier';

const MAX_INCLUDE_DEPTH = 16;
const MAX_CONFIG_FILES = 256;
const MAX_CONFIG_BYTES = 4 * 1024 * 1024;

function directiveValues(value: SSHConfig.Directive['value']): string[] {
    return Array.isArray(value) ? value.map(entry => entry.val) : [value];
}

function matchesPatterns(patterns: string[], candidate: string, ignoreCase: boolean): boolean {
    let matched = false;
    for (const entry of patterns) {
        const negated = entry.startsWith('!');
        const pattern = negated ? entry.slice(1) : entry;
        if (!pattern) throw new SSHHostVerificationError('Empty SSH condition pattern');
        const expression = pattern.replaceAll(/[\\^$+.[\]{}()|]/g, String.raw`\$&`).replaceAll(/\*+/g, '.*').replaceAll('?', '.');
        if (new RegExp(`^${expression}$`, ignoreCase ? 'i' : '').test(candidate)) {
            if (negated) return false;
            matched = true;
        }
    }
    return matched;
}

function localUsername(): string {
    if (os.platform() === 'win32') {
        const executable = path.join(process.env.windir || String.raw`C:\Windows`, 'System32', 'whoami.exe');
        const result = spawnSync(executable, [], {
            encoding: 'utf8', shell: false, windowsHide: true, timeout: 5000, maxBuffer: 4096
        });
        const account = result.stdout?.trim().toLowerCase();
        if (result.error || result.status !== 0 || result.stderr?.trim() || !account || !/^[^\\\r\n]+\\[^\\\r\n]+$/.test(account)) {
            throw new SSHHostVerificationError('Unable to determine Windows local username for SSH Match');
        }
        const [domain, username] = account.split('\\');
        return domain === os.hostname().toLowerCase() || account === String.raw`nt authority\system` ? username : account;
    }
    let username: string | undefined;
    try {
        username = os.userInfo().username;
    } catch {
        username = process.env.USER || process.env.USERNAME;
    }
    if (!username) throw new SSHHostVerificationError('Unable to determine local username for SSH Match');
    return username;
}

function includePaths(value: SSHConfig.Directive['value'], filename: string, baseDirectory: string): string[] {
    const values = Array.isArray(value) ? value.map(entry => entry.val) : [value];
    if (!values.length || values.some(entry => !entry)) {
        throw new SSHHostVerificationError(`Empty SSH Include directive in ${filename}`);
    }
    return values.map(entry => {
        let expanded = entry.replaceAll(/\$\{([^}]+)\}/g, (_match, name: string) => {
            const environmentValue = process.env[name];
            if (environmentValue === undefined) {
                throw new SSHHostVerificationError(`Unset environment variable ${name} in SSH Include in ${filename}`);
            }
            return environmentValue;
        });
        expanded = expanded.replaceAll(/%(.)?/g, (token, supported: string | undefined) => {
            if (supported === '%') return '%';
            if (supported === 'd') return os.homedir();
            throw new SSHHostVerificationError(`Unsupported SSH Include token ${token} in ${filename}`);
        });
        if (expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\')) {
            expanded = path.join(os.homedir(), expanded.slice(2));
        } else if (expanded.startsWith('~')) {
            throw new SSHHostVerificationError(`Named-user home expansion is unsupported in SSH Include in ${filename}`);
        }
        const absolute = path.isAbsolute(expanded) ? expanded : path.join(baseDirectory, expanded);
        return os.platform() === 'win32' ? absolute.replaceAll('\\', '/') : absolute;
    });
}

function expandIncludePattern(pattern: string, sourceFile: string): string[] {
    try {
        return globSync(pattern, {
            absolute: true, onlyFiles: false, braceExpansion: false, extglob: false,
            globstar: false, expandDirectories: false
        }).sort((left, right) => left.localeCompare(right));
    } catch (error) {
        throw new SSHHostVerificationError(`Unable to expand SSH Include ${pattern} in ${sourceFile}`, { cause: error });
    }
}

function expandHostName(value: string, host: string, sourceFile: string): string {
    return value.replaceAll(/%(.)?/g, (token, name: string | undefined) => {
        if (name === '%') return '%';
        if (name === 'h') return host;
        throw new SSHHostVerificationError(`Unsupported SSH HostName token ${token} (${sourceFile})`);
    });
}

export function resolveSSHConfigIncludes(config: SSHConfig.SSHConfig, host: string, filename: string, fallbackUsername?: string,
    additionalSources: { config: SSHConfig.SSHConfig; filename: string; baseDirectory: string }[] = []): SSHConfig.SSHConfig {
    const resolved = new SSHConfig.SSHConfig();
    const activeFiles = new Set<string>();
    let filesRead = 0;
    let bytesRead = 0;
    let effectiveHost = host;
    let configuredHost = false;
    let configuredUsername: string | undefined;
    let rootFilename = filename;
    let baseDirectory = path.join(os.homedir(), '.ssh');

    function conditionCandidate(name: string): string {
        switch (name) {
            case 'host': return effectiveHost;
            case 'originalhost': return host;
            case 'localuser': return localUsername();
            default: return configuredUsername || fallbackUsername || localUsername();
        }
    }

    function matchesCriterion(criterion: string, argument: string | undefined, sourceFile: string): boolean {
        const negated = criterion.startsWith('!');
        const name = negated ? criterion.slice(1) : criterion;
        if (!['host', 'originalhost', 'user', 'localuser'].includes(name)) {
            throw new SSHHostVerificationError(`Unsupported SSH Match criterion ${criterion} (${sourceFile}); refusing to omit its policy`);
        }
        if (!argument || argument.split(',').some(pattern => !pattern || pattern === '!')) {
            throw new SSHHostVerificationError(`Missing or empty SSH Match ${criterion} pattern (${sourceFile})`);
        }
        const candidate = conditionCandidate(name);
        if (name === 'user' && /%|\$\{/.test(candidate)) {
            throw new SSHHostVerificationError(`Tokenized SSH User values cannot be safely evaluated for Match user (${sourceFile})`);
        }
        const condition = matchesPatterns(argument.split(','), candidate, name === 'host' || name === 'originalhost');
        return negated ? !condition : condition;
    }

    function matchesCondition(line: SSHConfig.Directive, sourceFile: string): boolean {
        const values = directiveValues(line.value);
        if (values.length === 1 && values[0].toLowerCase() === 'all') return true;
        let matched = true;
        for (let index = 0; index < values.length; index += 2) {
            const condition = matchesCriterion(values[index].toLowerCase(), values[index + 1], sourceFile);
            matched = matched && condition;
        }
        return matched;
    }

    function visitFile(includedFile: string): void {
        if (!activeFiles.size) activeFiles.add(fs.realpathSync(rootFilename));
        if (activeFiles.size > MAX_INCLUDE_DEPTH || ++filesRead > MAX_CONFIG_FILES) {
            throw new SSHHostVerificationError(`SSH Include resolution limit exceeded at ${includedFile}`);
        }
        let canonicalFile: string;
        try {
            canonicalFile = fs.realpathSync(includedFile);
            if (activeFiles.has(canonicalFile)) {
                throw new SSHHostVerificationError(`SSH Include cycle detected at ${includedFile}`);
            }
            const metadata = fs.statSync(includedFile);
            if (!metadata.isFile() || metadata.size > MAX_CONFIG_BYTES - bytesRead) {
                throw new SSHHostVerificationError(`SSH Include is not a regular file or exceeds the size limit: ${includedFile}`);
            }
            const content = fs.readFileSync(includedFile, 'utf8');
            bytesRead += Buffer.byteLength(content, 'utf8');
            if (bytesRead > MAX_CONFIG_BYTES) {
                throw new SSHHostVerificationError(`SSH Include size limit exceeded at ${includedFile}`);
            }
            activeFiles.add(canonicalFile);
            try {
                visit(SSHConfig.parse(content), includedFile);
            } finally {
                activeFiles.delete(canonicalFile);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new SSHHostVerificationError(`Unable to resolve SSH Include file ${includedFile}: ${reason}`, { cause: error });
        }
    }

    function applyDirective(line: SSHConfig.Directive, sourceFile: string): void {
        const directive = line.param.toLowerCase();
        if (directive === 'canonicalizehostname' && !['no', 'none'].includes(directiveValues(line.value)[0].toLowerCase())) {
            throw new SSHHostVerificationError(`OpenSSH hostname canonicalization cannot be safely resolved for toolkit connections (${sourceFile})`);
        }
        let appliedLine = line;
        if (directive === 'hostname' && !configuredHost) {
            effectiveHost = expandHostName(directiveValues(line.value)[0], host, sourceFile);
            configuredHost = true;
            appliedLine = { ...line, value: effectiveHost };
        }
        if (directive === 'user' && configuredUsername === undefined) {
            configuredUsername = directiveValues(line.value)[0];
        }
        resolved.push(appliedLine);
    }

    function visitIncludes(line: SSHConfig.Directive, sourceFile: string): void {
        for (const pattern of includePaths(line.value, sourceFile, baseDirectory)) {
            for (const match of expandIncludePattern(pattern, sourceFile)) visitFile(match);
        }
    }

    function visit(lines: SSHConfig.Line[], sourceFile: string): void {
        for (const line of lines) {
            if (line.type !== SSHConfig.LineType.DIRECTIVE) continue;
            const directive = line.param.toLowerCase();
            if ((directive === 'host' || directive === 'match') && 'config' in line) {
                const matched = directive === 'host'
                    ? matchesPatterns(directiveValues(line.value), host, true)
                    : matchesCondition(line, sourceFile);
                if (matched) {
                    visit(line.config, sourceFile);
                }
            } else if (directive === 'include') {
                visitIncludes(line, sourceFile);
            } else {
                applyDirective(line, sourceFile);
            }
        }
    }

    visit(config, filename);
    for (const source of additionalSources) {
        activeFiles.clear();
        rootFilename = source.filename;
        baseDirectory = source.baseDirectory;
        visit(source.config, source.filename);
    }
    return resolved;
}