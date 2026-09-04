/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'HPInc.zgx-toolkit';
const LEGACY_DISPLAY_NAMES = ['HP ZGX', 'Z Toolkit'];

suite('ZgxToolkitProvider Integration', () => {
    let ext: vscode.Extension<any>;

    suiteSetup(async function () {
        ext =
            vscode.extensions.getExtension(EXTENSION_ID) ||
            vscode.extensions.all.find(e =>
                LEGACY_DISPLAY_NAMES.includes(e.packageJSON.displayName)
            ) as any;
    
        if (!ext) {
            throw new Error(`Extension not found (id "${EXTENSION_ID}")`);
        }
        if (!ext.isActive) {
            await ext.activate();
        }
    });

    test('Extension activates successfully', () => {
        assert.ok(ext.isActive, 'Extension should be activated');
    });

    test('Commands are registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        // Check for key commands
        assert.ok(commands.includes('zgxToolkit.setLogLevel'), 'setLogLevel command should be registered');
    });
});