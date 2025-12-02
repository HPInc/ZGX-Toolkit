/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ZgxToolkitProvider } from '../../providers/zgxToolkitProvider';
import { TelemetryReporter } from '@vscode/extension-telemetry';

const EXTENSION_ID = 'HPInc.zgx-toolkit';
const LEGACY_DISPLAY_NAMES = ['HP ZGX', 'ZGX Toolkit'];

// Emulates VS Code's Webview + WebviewView for integration-style testing
class TempWebview implements vscode.Webview {
    html = '';
    options: vscode.WebviewOptions = {};
    asWebviewUri(uri: vscode.Uri) { return uri; }
    cspSource = 'vscode-resource://test';
    onDidReceiveMessage = () => ({ dispose() {} });
    postMessage = async () => true;
}

// Simple no-op event factory
function noopEvent<T>(): vscode.Event<T> {
    return () => ({ dispose() {} });
}

class TempWebviewView implements vscode.WebviewView {
    constructor(public webview: vscode.Webview) {}
    viewType = 'remoteDevicesList';
    title = 'Devices';
    description = undefined;
    badge = undefined;
    visible = true; // Added to satisfy interface
    onDidDispose = noopEvent<void>();
    onDidChangeVisibility = noopEvent<void>();
    show() {}
}

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