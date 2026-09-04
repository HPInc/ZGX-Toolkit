/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { GLOBAL_STATE_KEYS } from '../constants/globalState';
import { CONFIG_SECTION, LEGACY_CONFIG_SECTION } from '../constants/config';
import { logger } from '../utils/logger';

/** Short config keys that exist under both the legacy and new config sections. */
const MIGRATABLE_KEYS = ['logLevel', 'telemetry.enabled'] as const;

export class ConfigurationSchemaNotRegisteredError extends Error {
    constructor() {
        super('zToolkit configuration schema not yet registered; reload the window to complete migration.');
        this.name = 'ConfigurationSchemaNotRegisteredError';
    }
}

/**
 * Migrates user and workspace settings from the legacy `zgxToolkit.*` config section
 * to the new `zToolkit.*` section. Runs only once, gated by a globalState flag.
 */
export async function migrateSettings(context: vscode.ExtensionContext): Promise<void> {

    if (context.globalState.get<boolean>(GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1)) {
        return;
    }

    const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIG_SECTION);
    const newConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);

    // `defaultValue` is only populated once the workbench has registered the zToolkit.* contribution;
    // its absence means this host is still bound to a stale configuration registry (needs a reload).
    const schemaRegistered = MIGRATABLE_KEYS.every((key) => newConfig.inspect(key)?.defaultValue !== undefined);
    if (!schemaRegistered) {
        logger.info('zToolkit configuration schema not yet registered; deferring settings migration until after a window reload');
        throw new ConfigurationSchemaNotRegisteredError();
    }

    logger.info('Running one-time settings migration from zgxToolkit to zToolkit');

    for (const key of MIGRATABLE_KEYS) {
        const inspection = legacyConfig.inspect(key);
        if (!inspection) {
            continue;
        }

        if (inspection.globalValue !== undefined) {
            await newConfig.update(key, inspection.globalValue, vscode.ConfigurationTarget.Global);
            await legacyConfig.update(key, undefined, vscode.ConfigurationTarget.Global);
            logger.debug('Migrated user setting', { key, value: inspection.globalValue });
        }

        if (inspection.workspaceValue !== undefined) {
            await newConfig.update(key, inspection.workspaceValue, vscode.ConfigurationTarget.Workspace);
            await legacyConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
            logger.debug('Migrated workspace setting', { key, value: inspection.workspaceValue });
        }
    }

    await context.globalState.update(GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1, true);
    logger.info('Settings migration complete');
}
