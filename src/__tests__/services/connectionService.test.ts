/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ConnectionService } from "../../services";
import { Device } from "../../types";
import * as path from 'path';

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