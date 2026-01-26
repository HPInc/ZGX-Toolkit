/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Keys for values stored in VS Code's globalState.
 */

/**
 * Global state keys used by the extension.
 */
export const GLOBAL_STATE_KEYS = {
    /** Whether the extension has run before*/
    HAS_RUN_BEFORE: 'hasRunBefore',
} as const;

/**
 * Type for global state keys.
 */
export type GlobalStateKey = typeof GLOBAL_STATE_KEYS[keyof typeof GLOBAL_STATE_KEYS];
