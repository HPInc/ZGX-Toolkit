/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Time conversion constant: milliseconds per minute.
 */
export const MILLISECONDS_PER_MINUTE = 60000 as const;

/**
 * Background updater interval in milliseconds.
 * Default is 10 minutes (600000ms).
 */
export const BACKGROUND_UPDATER_INTERVAL = 600000 as const;

/**
 * Interval in milliseconds at which an active Remote-SSH session refreshes its heartbeat
 * in the shared active session registry.
 */
export const REMOTE_SESSION_HEARTBEAT_INTERVAL_MS = 10000 as const;

/**
 * Maximum age, in milliseconds, of an active session entry's last heartbeat before it is
 * considered stale and pruned during connection state reconciliation, treating the device
 * as disconnected rather than leaving it permanently stuck "connected".
 */
export const STALE_SESSION_THRESHOLD_MS = 30000 as const;

/**
 * Bounded window, in milliseconds, to wait for the remote side to register its active
 * session entry after initiating a Remote-SSH connection, before treating it as unconfirmed
 * (rather than showing a false-positive success message).
 */
export const REMOTE_SESSION_CONFIRMATION_TIMEOUT_MS = 20000 as const;
