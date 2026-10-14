/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Remote session registry service.
 *
 * Tracks active Remote-SSH sessions in a shared active-sessions.json file (under the
 * user's home directory) so that all VS Code windows on the machine can be notified of
 * connect/disconnect/heartbeat activity without polling. Change notifications are backed
 * by a debounced vscode.FileSystemWatcher on the registry file.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActiveSessionEntry } from '../types/remoteSession';
import { logger } from '../utils/logger';

/** Debounce window for coalescing rapid successive file change events. */
const CHANGE_DEBOUNCE_MS = 250;
/** Number of attempts to replace the registry after a transient file lock. */
const RENAME_MAX_ATTEMPTS = 4;
/** Initial delay between registry replacement attempts. */
const RENAME_RETRY_DELAY_MS = 50;

/**
 * Service for registering, updating, and reading active remote SSH session entries
 * shared across VS Code windows via a JSON file on disk.
 */
class RemoteSessionRegistryService {
    private readonly registryDir = path.join(os.homedir(), '.ztk');
    private readonly registryFile = path.join(this.registryDir, 'active-sessions.json');

    private readonly onDidChangeEmitter = new vscode.EventEmitter<ActiveSessionEntry[]>();
    private watcher?: vscode.FileSystemWatcher;
    private debounceTimer?: ReturnType<typeof setTimeout>;

    /**
     * Register a new active session for a device, replacing any existing entry for
     * that device.
     */
    public async register(entry: Omit<ActiveSessionEntry, 'connectedAt' | 'lastHeartbeat'>): Promise<void> {
        const now = new Date().toISOString();
        await this.updateEntries(entries => [
            ...entries.filter(e => e.deviceId !== entry.deviceId),
            { ...entry, connectedAt: now, lastHeartbeat: now }
        ]);
        logger.debug('Registered active remote session', { deviceId: entry.deviceId, windowId: entry.windowId });
    }

    /**
     * Refresh the heartbeat timestamp for an already-registered device owned by
     * this window/session.
     * No-op if the matching owned session is not currently registered.
     */
    public async heartbeat(deviceId: string, ownerWindowId: string): Promise<void> {
        const now = new Date().toISOString();
        let updated = false;
        await this.updateEntries(entries => {
            const nextEntries = entries.map(entry => {
                if (entry.deviceId === deviceId && entry.windowId === ownerWindowId) {
                    updated = true;
                    return { ...entry, lastHeartbeat: now };
                }
                return entry;
            });
            return updated ? nextEntries : undefined;
        });
    }

    /**
     * Request that the specified session owner close its Remote-SSH connection.
     * The target window identifier prevents an old window from disconnecting a newer
     * replacement session for the same device.
     *
     * @returns true when a matching active session was found and signalled
     */
    public async requestDisconnect(deviceId: string, targetWindowId: string): Promise<boolean> {
        const requestedAt = new Date().toISOString();
        let requestRecorded = false;

        await this.updateEntries(entries => {
            const targetSession = entries.find(entry =>
                entry.deviceId === deviceId && entry.windowId === targetWindowId
            );
            if (!targetSession) {
                return undefined;
            }

            requestRecorded = true;
            return entries.map(entry =>
                entry === targetSession ? { ...entry, disconnectRequestedAt: requestedAt } : entry
            );
        });

        if (requestRecorded) {
            logger.debug('Requested remote session disconnect', { deviceId, targetWindowId });
        }

        return requestRecorded;
    }

    /**
     * Consume a pending disconnect request for the specified session owner.
     * The owner calls this before closing its own remote connection.
     *
     * @returns true when a pending request was consumed
     */
    public async consumeDisconnectRequest(deviceId: string, targetWindowId: string): Promise<boolean> {
        let requestConsumed = false;

        await this.updateEntries(entries => {
            const targetSession = entries.find(entry =>
                entry.deviceId === deviceId &&
                entry.windowId === targetWindowId &&
                typeof entry.disconnectRequestedAt === 'string'
            );
            if (!targetSession) {
                return undefined;
            }

            requestConsumed = true;
            return entries.map(entry =>
                entry === targetSession ? { ...entry, disconnectRequestedAt: undefined } : entry
            );
        });

        if (requestConsumed) {
            logger.debug('Consumed remote session disconnect request', { deviceId, targetWindowId });
        }

        return requestConsumed;
    }

    /**
     * Remove the active session entry for a device owned by this window/session.
     */
    public async unregister(deviceId: string, ownerWindowId: string): Promise<void> {
        let removed = false;
        await this.updateEntries(entries => {
            const remainingEntries = entries.filter(entry => {
                const shouldRemove = entry.deviceId === deviceId && entry.windowId === ownerWindowId;
                if (shouldRemove) {
                    removed = true;
                }
                return !shouldRemove;
            });
            return removed ? remainingEntries : undefined;
        });
        if (removed) {
            logger.debug('Unregistered active remote session', { deviceId, windowId: ownerWindowId });
        }
    }

    /**
     * Read all active session entries currently in the registry file.
     * Returns an empty array if the file does not exist or cannot be parsed.
     */
    public async readAll(): Promise<ActiveSessionEntry[]> {
        return this.readEntries();
    }

    /**
     * Subscribe to changes in the registry file. Rapid successive file events (as happen
     * when multiple windows write in quick succession) are debounced into a single
     * notification carrying the latest entries.
     */
    public onDidChange(listener: (entries: ActiveSessionEntry[]) => void): vscode.Disposable {
        this.ensureWatcher();
        return this.onDidChangeEmitter.event(listener);
    }

    /**
     * Dispose the file watcher and event emitter. Safe to call multiple times.
     */
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        this.watcher?.dispose();
        this.watcher = undefined;
        this.onDidChangeEmitter.dispose();
    }

    /**
     * Lazily create the FileSystemWatcher on first subscription.
     */
    private ensureWatcher(): void {
        if (this.watcher) {
            return;
        }

        // The registry file lives outside any workspace folder, so a plain string pattern
        // isn't reliably watched; a RelativePattern with an explicit base is required.
        const pattern = new vscode.RelativePattern(vscode.Uri.file(this.registryDir), 'active-sessions.json');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const scheduleNotify = () => this.scheduleChangeNotification();
        this.watcher.onDidChange(scheduleNotify);
        this.watcher.onDidCreate(scheduleNotify);
        this.watcher.onDidDelete(scheduleNotify);
    }

    /**
     * Debounce rapid file change events before reading the file and notifying listeners.
     */
    private scheduleChangeNotification(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.readEntries()
                .then(entries => this.onDidChangeEmitter.fire(entries))
                .catch(error => logger.error('Failed to read active sessions after change', { error }));
        }, CHANGE_DEBOUNCE_MS);
    }

    /**
     * Read and parse the registry file, tolerating a missing or corrupt file.
     */
    private async readEntries(): Promise<ActiveSessionEntry[]> {
        try {
            if (!fs.existsSync(this.registryFile)) {
                return [];
            }
            const content = await fs.promises.readFile(this.registryFile, 'utf-8');
            const parsed: unknown = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.filter((entry): entry is ActiveSessionEntry => this.isValidEntry(entry));
        } catch (error) {
            logger.error('Failed to read active sessions registry', { error });
            return [];
        }
    }

    /**
     * Apply a mutation to the current entries and write the result back to disk.
     */
    private async updateEntries(mutate: (entries: ActiveSessionEntry[]) => ActiveSessionEntry[] | undefined): Promise<void> {
        try {
            const current = await this.readEntries();
            const updated = mutate(current);
            if (!updated) {
                return;
            }
            await this.writeEntries(updated);
        } catch (error) {
            logger.error('Failed to update active sessions registry', { error });
            throw error;
        }
    }

    /**
     * Write entries to the registry file atomically via a temp file + rename, so that
     * concurrent readers in other windows never observe a partial write.
     */
    private async writeEntries(entries: ActiveSessionEntry[]): Promise<void> {
        if (!fs.existsSync(this.registryDir)) {
            await fs.promises.mkdir(this.registryDir, { recursive: true });
        }

        const tempFile = `${this.registryFile}.${process.pid}.${Date.now()}.tmp`;
        let renamed = false;

        try {
            await fs.promises.writeFile(tempFile, JSON.stringify(entries, null, 2), 'utf-8');
            await this.renameTempFileWithRetry(tempFile);
            renamed = true;
        } finally {
            if (!renamed) {
                await this.removeTemporaryFile(tempFile);
            }
        }
    }

    /**
     * Replace the registry file, retrying errors caused by short-lived Windows file locks.
     */
    private async renameTempFileWithRetry(tempFile: string): Promise<void> {
        for (let attempt = 1; attempt <= RENAME_MAX_ATTEMPTS; attempt += 1) {
            try {
                await fs.promises.rename(tempFile, this.registryFile);
                return;
            } catch (error) {
                if (!this.isRetryableRenameError(error) || attempt === RENAME_MAX_ATTEMPTS) {
                    throw error;
                }

                await new Promise<void>(resolve => setTimeout(resolve, RENAME_RETRY_DELAY_MS * attempt));
            }
        }
    }

    /**
     * Remove a temporary file left by a failed write without hiding the original failure.
     */
    private async removeTemporaryFile(tempFile: string): Promise<void> {
        try {
            await fs.promises.unlink(tempFile);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
                logger.warn('Failed to remove active sessions registry temporary file', { error, tempFile });
            }
        }
    }

    /**
     * Windows reports sharing violations and antivirus scans as these transient errors.
     */
    private isRetryableRenameError(error: unknown): boolean {
        const code = (error as NodeJS.ErrnoException).code;
        return code === 'EACCES' || code === 'EBUSY' || code === 'EPERM';
    }

    /**
     * Validate that a parsed object matches the shape of an ActiveSessionEntry.
     */
    private isValidEntry(entry: unknown): entry is ActiveSessionEntry {
        if (!entry || typeof entry !== 'object') {
            return false;
        }
        const candidate = entry as Partial<ActiveSessionEntry>;
        return (
            typeof candidate.deviceId === 'string' &&
            typeof candidate.connectLabel === 'string' &&
            typeof candidate.windowId === 'string' &&
            typeof candidate.connectedAt === 'string' &&
            typeof candidate.lastHeartbeat === 'string' &&
            (candidate.disconnectRequestedAt === undefined || typeof candidate.disconnectRequestedAt === 'string')
        );
    }
}

/**
 * Singleton remote session registry service instance.
 */
export const remoteSessionRegistryService = new RemoteSessionRegistryService();

/**
 * Export the class for testing purposes.
 */
export { RemoteSessionRegistryService };
