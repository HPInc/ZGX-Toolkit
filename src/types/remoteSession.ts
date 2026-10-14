/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * An entry recording that a Remote-SSH session to a device is currently active in some
 * VS Code window. Persisted in the shared active-sessions.json registry file so that other
 * windows can react to connect/disconnect activity without polling.
 */
export interface ActiveSessionEntry {
    /** Identifier of the connected device */
    deviceId: string;
    /** Human-readable label describing the connection (e.g. device/host name) */
    connectLabel: string;
    /** Identifier of the VS Code window that owns this session */
    windowId: string;
    /** ISO timestamp of when the session was established */
    connectedAt: string;
    /** ISO timestamp of the most recent heartbeat refresh */
    lastHeartbeat: string;
    /** ISO timestamp of a disconnect request from another VS Code window */
    disconnectRequestedAt?: string;
}
