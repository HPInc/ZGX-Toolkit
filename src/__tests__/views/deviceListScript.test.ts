/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('Device List webview script', () => {
    it('does not register a collapse handler on paired group containers', () => {
        const domReadyListeners: (() => void)[] = [];
        const pairedGroupContainer = { addEventListener: jest.fn() };
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: () => void) => {
                if (eventName === 'DOMContentLoaded') {
                    domReadyListeners.push(listener);
                }
            }),
            getElementById: jest.fn(() => null),
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn((selector: string) => (
                selector === '.sidebar-paired-group-container' ? [pairedGroupContainer] : []
            ))
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock,
            window: { addEventListener: jest.fn() }
        };
        const scriptPath = path.resolve(process.cwd(), 'src/views/devices/list/deviceList.js');
        const script = fs.readFileSync(scriptPath, 'utf8');

        vm.runInNewContext(script, context);

        expect(domReadyListeners).toHaveLength(1);
        domReadyListeners[0]();

        expect(documentMock.querySelectorAll).not.toHaveBeenCalledWith('.sidebar-paired-group-container');
        expect(pairedGroupContainer.addEventListener).not.toHaveBeenCalled();
    });

    it('uses the shared button height for Pair Devices', () => {
        const stylesheetPath = path.resolve(process.cwd(), 'src/views/devices/manager/deviceManager.css');
        const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
        const pairDevicesRule = stylesheet.match(/\.pair-devices-button\s*\{(?<declarations>[^}]*)\}/);

        expect(pairDevicesRule?.groups?.declarations).not.toMatch(/(?:height|line-height|min-block-size|padding-block)\s*:/);
    });
});
