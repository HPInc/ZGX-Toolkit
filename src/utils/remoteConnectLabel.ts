/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Shared pure helpers for constructing and parsing the Remote-SSH "connect label" used both
 * when initiating a connection (connectionService) and when resolving an already-connected
 * remote window back to a known Device (extension activation). Keeping this logic in one
 * place ensures both directions of the mapping stay in sync.
 */

import { Device } from '../types/devices';

/**
 * Build the SSH connect label VS Code's Remote-SSH extension uses to identify a target.
 * Devices on the default port connect via `user@host`; devices on a non-default port
 * connect via a stable alias registered in the user's SSH config.
 */
export function buildRemoteConnectLabel(device: Device): string {
    if (device.port === 22) {
        return `${device.username}@${device.host}`;
    }

    const filteredHost = device.host.replaceAll(/[^a-zA-Z0-9_.-]/g, '');
    return `zgx-${filteredHost}-${device.port}`;
}

/**
 * Extract the connect label from a `ssh-remote+<label>` authority string, such as the
 * `authority` of a workspace folder's URI when connected via Remote-SSH, decoding any
 * URI-encoded characters.
 *
 * @returns The decoded connect label, or undefined if the authority isn't an ssh-remote authority
 */
export function extractConnectLabelFromRemoteAuthority(remoteAuthority: string | undefined): string | undefined {
    if (!remoteAuthority) {
        return undefined;
    }

    const match = /^ssh-remote\+(.+)$/.exec(remoteAuthority);
    if (!match) {
        return undefined;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

/**
 * Resolve a connect label (extracted from `vscode.env.remoteAuthority`) back to the known
 * Device it corresponds to, using the same label construction logic as `buildRemoteConnectLabel`.
 */
export function findDeviceByConnectLabel(devices: Device[], connectLabel: string): Device | undefined {
    return devices.find(device => buildRemoteConnectLabel(device) === connectLabel);
}
