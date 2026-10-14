/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the RemoteSessionRegistryService.
 */

import { RemoteSessionRegistryService } from '../../services/remoteSessionRegistryService';
import * as vscode from 'vscode';
import * as fs from 'node:fs';

jest.mock('vscode');
jest.mock('../../utils/logger');
jest.mock('node:os', () => ({
    homedir: jest.fn(() => '/home/testuser')
}));
jest.mock('node:fs', () => ({
    existsSync: jest.fn(),
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        rename: jest.fn(),
        mkdir: jest.fn(),
        unlink: jest.fn()
    }
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('RemoteSessionRegistryService', () => {
    let service: RemoteSessionRegistryService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedFs.existsSync.mockReturnValue(true);
        (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('[]');
        (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
        (mockedFs.promises.rename as jest.Mock).mockResolvedValue(undefined);
        (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
        (mockedFs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
        service = new RemoteSessionRegistryService();
    });

    describe('readAll', () => {
        it('returns an empty array when the registry file does not exist', async () => {
            mockedFs.existsSync.mockReturnValue(false);

            const entries = await service.readAll();

            expect(entries).toEqual([]);
            expect(mockedFs.promises.readFile).not.toHaveBeenCalled();
        });

        it('returns parsed entries from the registry file', async () => {
            const entry = {
                deviceId: 'device-1',
                connectLabel: 'My Device',
                windowId: 'window-1',
                connectedAt: '2026-01-01T00:00:00.000Z',
                lastHeartbeat: '2026-01-01T00:00:00.000Z'
            };
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([entry]));

            const entries = await service.readAll();

            expect(entries).toEqual([entry]);
        });

        it('filters out malformed entries', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([{ deviceId: 'bad' }]));

            const entries = await service.readAll();

            expect(entries).toEqual([]);
        });

        it('returns an empty array when the file contains invalid JSON', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('not json');

            const entries = await service.readAll();

            expect(entries).toEqual([]);
        });
    });

    describe('register', () => {
        it('writes a new entry with connectedAt and lastHeartbeat timestamps', async () => {
            await service.register({ deviceId: 'device-1', connectLabel: 'My Device', windowId: 'window-1' });

            expect(mockedFs.promises.writeFile).toHaveBeenCalledTimes(1);
            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            expect(written).toHaveLength(1);
            expect(written[0]).toMatchObject({ deviceId: 'device-1', connectLabel: 'My Device', windowId: 'window-1' });
            expect(written[0].connectedAt).toEqual(written[0].lastHeartbeat);
            expect(mockedFs.promises.rename).toHaveBeenCalledTimes(1);
        });

        it('replaces an existing entry for the same device', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([{
                deviceId: 'device-1',
                connectLabel: 'Old Label',
                windowId: 'window-0',
                connectedAt: '2026-01-01T00:00:00.000Z',
                lastHeartbeat: '2026-01-01T00:00:00.000Z'
            }]));

            await service.register({ deviceId: 'device-1', connectLabel: 'New Label', windowId: 'window-1' });

            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            expect(written).toHaveLength(1);
            expect(written[0].connectLabel).toBe('New Label');
        });

        it('retries a transient registry rename failure', async () => {
            const lockError = Object.assign(new Error('file is locked'), { code: 'EPERM' });
            (mockedFs.promises.rename as jest.Mock)
                .mockRejectedValueOnce(lockError)
                .mockResolvedValueOnce(undefined);

            await service.register({ deviceId: 'device-1', connectLabel: 'My Device', windowId: 'window-1' });

            expect(mockedFs.promises.rename).toHaveBeenCalledTimes(2);
            expect(mockedFs.promises.unlink).not.toHaveBeenCalled();
        });

        it('removes its temporary file when a rename fails permanently', async () => {
            const renameError = Object.assign(new Error('rename failed'), { code: 'EIO' });
            (mockedFs.promises.rename as jest.Mock).mockRejectedValue(renameError);

            await expect(service.register({
                deviceId: 'device-1',
                connectLabel: 'My Device',
                windowId: 'window-1'
            })).rejects.toThrow('rename failed');

            expect(mockedFs.promises.unlink).toHaveBeenCalledWith(
                expect.stringMatching(/active-sessions\.json\.\d+\.\d+\.tmp$/)
            );
        });
    });

    describe('heartbeat', () => {
        it('updates lastHeartbeat only for the matching owned session', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
                { deviceId: 'device-1', connectLabel: 'A', windowId: 'w1', connectedAt: '2026-01-01T00:00:00.000Z', lastHeartbeat: '2026-01-01T00:00:00.000Z' },
                { deviceId: 'device-2', connectLabel: 'B', windowId: 'w2', connectedAt: '2026-01-01T00:00:00.000Z', lastHeartbeat: '2026-01-01T00:00:00.000Z' }
            ]));

            await service.heartbeat('device-1', 'w1');

            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            const updated = written.find((e: any) => e.deviceId === 'device-1');
            const untouched = written.find((e: any) => e.deviceId === 'device-2');
            expect(updated.lastHeartbeat).not.toBe('2026-01-01T00:00:00.000Z');
            expect(untouched.lastHeartbeat).toBe('2026-01-01T00:00:00.000Z');
        });

        it('does not update heartbeat when ownership no longer matches', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
                { deviceId: 'device-1', connectLabel: 'A', windowId: 'w2', connectedAt: '2026-01-01T00:00:00.000Z', lastHeartbeat: '2026-01-01T00:00:00.000Z' }
            ]));

            await service.heartbeat('device-1', 'w1');

            expect(mockedFs.promises.writeFile).not.toHaveBeenCalled();
            expect(mockedFs.promises.rename).not.toHaveBeenCalled();
        });
    });

    describe('disconnect requests', () => {
        const activeSession = {
            deviceId: 'device-1',
            connectLabel: 'A',
            windowId: 'window-1',
            connectedAt: '2026-01-01T00:00:00.000Z',
            lastHeartbeat: '2026-01-01T00:00:00.000Z'
        };

        it('records a disconnect request for the matching session owner', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([activeSession]));

            await expect(service.requestDisconnect('device-1', 'window-1')).resolves.toBe(true);

            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            expect(written[0]).toMatchObject(activeSession);
            expect(written[0].disconnectRequestedAt).toEqual(expect.any(String));
        });

        it('does not signal a session when the target owner is no longer active', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([activeSession]));

            await expect(service.requestDisconnect('device-1', 'window-2')).resolves.toBe(false);

            expect(mockedFs.promises.writeFile).not.toHaveBeenCalled();
        });

        it('consumes a disconnect request only for its session owner', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
                { ...activeSession, disconnectRequestedAt: '2026-01-02T00:00:00.000Z' },
                { ...activeSession, deviceId: 'device-2', windowId: 'window-2' }
            ]));

            await expect(service.consumeDisconnectRequest('device-1', 'window-1')).resolves.toBe(true);

            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            expect(written[0]).not.toHaveProperty('disconnectRequestedAt');
            expect(written[1]).toMatchObject({ deviceId: 'device-2', windowId: 'window-2' });
        });
    });

    describe('unregister', () => {
        it('removes the entry for the matching owned session', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
                { deviceId: 'device-1', connectLabel: 'A', windowId: 'w1', connectedAt: '2026-01-01T00:00:00.000Z', lastHeartbeat: '2026-01-01T00:00:00.000Z' }
            ]));

            await service.unregister('device-1', 'w1');

            const written = JSON.parse((mockedFs.promises.writeFile as jest.Mock).mock.calls[0][1]);
            expect(written).toEqual([]);
        });

        it('does not remove a replacement session owned by another window', async () => {
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
                { deviceId: 'device-1', connectLabel: 'A', windowId: 'w2', connectedAt: '2026-01-01T00:00:00.000Z', lastHeartbeat: '2026-01-01T00:00:00.000Z' }
            ]));

            await service.unregister('device-1', 'w1');

            expect(mockedFs.promises.writeFile).not.toHaveBeenCalled();
            expect(mockedFs.promises.rename).not.toHaveBeenCalled();
        });
    });

    describe('onDidChange', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('creates a file system watcher using a RelativePattern rooted outside the workspace', () => {
            service.onDidChange(() => { /* noop */ });

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
                expect.objectContaining({
                    pattern: 'active-sessions.json',
                    base: expect.stringContaining('.ztk')
                })
            );
        });

        it('debounces rapid file change events into a single notification', async () => {
            const listener = jest.fn();
            service.onDidChange(listener);

            const watcherMock = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
            const onDidChangeHandler = watcherMock.onDidChange.mock.calls[0][0];

            onDidChangeHandler();
            onDidChangeHandler();
            onDidChangeHandler();

            await jest.advanceTimersByTimeAsync(300);

            expect(mockedFs.promises.readFile).toHaveBeenCalledTimes(1);
        });

        it('only creates the watcher once across multiple subscriptions', () => {
            service.onDidChange(() => { /* noop */ });
            service.onDidChange(() => { /* noop */ });

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        });
    });

    describe('dispose', () => {
        it('disposes the watcher without throwing when never created', () => {
            expect(() => service.dispose()).not.toThrow();
        });

        it('disposes the watcher and clears pending timers', () => {
            service.onDidChange(() => { /* noop */ });
            const watcherMock = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;

            service.dispose();

            expect(watcherMock.dispose).toHaveBeenCalledTimes(1);
        });
    });
});
