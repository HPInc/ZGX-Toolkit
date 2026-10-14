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

    it('only animates the device the user explicitly checked, not unrelated devices in the same broadcast', () => {
        function createFakeItem(attributes: Record<string, string>) {
            const classes = new Set<string>();
            return {
                getAttribute: jest.fn((name: string) => attributes[name] ?? null),
                classList: {
                    remove: jest.fn((...names: string[]) => names.forEach(n => classes.delete(n))),
                    add: jest.fn((name: string) => classes.add(name)),
                    contains: jest.fn((name: string) => classes.has(name)),
                    toggle: jest.fn((name: string, force?: boolean) => {
                        if (force === false) { classes.delete(name); return false; }
                        classes.add(name);
                        return true;
                    })
                }
            };
        }

        function createFakeButton(deviceId: string) {
            const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
            return {
                getAttribute: jest.fn(() => deviceId),
                addEventListener: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
                    (listeners[eventName] = listeners[eventName] || []).push(listener);
                }),
                _listeners: listeners
            };
        }

        const checkedDeviceItem = createFakeItem({
            'data-id': 'device-checked',
            'data-device-status': 'reachable',
            'data-not-reachable': 'false',
            'data-reachability-checking': 'false',
            'data-reachability-checked-at': '2026-09-22T09:00:00.000Z'
        });
        const otherDeviceItem = createFakeItem({
            'data-id': 'device-other',
            'data-device-status': 'check-status',
            'data-not-reachable': 'true',
            'data-reachability-checking': 'false',
            'data-reachability-checked-at': '2026-09-22T09:00:00.000Z'
        });
        const itemsById: Record<string, ReturnType<typeof createFakeItem>> = {
            'device-checked': checkedDeviceItem,
            'device-other': otherDeviceItem
        };
        const checkStatusButton = createFakeButton('device-checked');

        const windowListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
                if (eventName === 'DOMContentLoaded') {
                    listener();
                }
            }),
            removeEventListener: jest.fn(),
            getElementById: jest.fn(() => null),
            querySelector: jest.fn((selector: string) => {
                const match = selector.match(/data-id="([^"]+)"/);
                return match ? itemsById[match[1]] ?? null : null;
            }),
            querySelectorAll: jest.fn((selector: string) => {
                if (selector === '.device-item[data-device-status]') {
                    return Object.values(itemsById);
                }
                if (selector === '[data-action="check-device-reachability"]') {
                    return [checkStatusButton];
                }
                return [];
            })
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock,
            window: {
                addEventListener: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
                    (windowListeners[eventName] = windowListeners[eventName] || []).push(listener);
                })
            }
        };
        const scriptPath = path.resolve(process.cwd(), 'src/views/devices/list/deviceList.js');
        const script = fs.readFileSync(scriptPath, 'utf8');

        vm.runInNewContext(script, context, { filename: scriptPath });

        // Simulate the user clicking "Refresh Status" for "device-checked" only.
        checkStatusButton._listeners['click'][0].call(checkStatusButton);

        const messageHandler = windowListeners['message'][0];

        // A background/full-fleet reachability check (e.g. the periodic updater right after
        // restart) broadcasts every device's status, including one the user never checked.
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [
                { deviceId: 'device-other', status: 'check-status', notReachable: true, checking: false, checkedAt: '2026-09-22T09:05:00.000Z', explicit: false },
                { deviceId: 'device-checked', status: 'reachable', notReachable: false, checking: true, checkedAt: '2026-09-22T09:00:00.000Z', explicit: true }
            ]
        } });

        expect(otherDeviceItem.classList.add).not.toHaveBeenCalled();
        expect(checkedDeviceItem.classList.add).toHaveBeenCalledWith('device-attention--checking');

        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: 'device-checked',
                status: 'unreachable',
                notReachable: false,
                unreachable: true,
                checking: false,
                checkedAt: '2026-09-22T09:01:00.000Z',
                explicit: true
            }]
        } });

        expect(checkedDeviceItem.classList.toggle).toHaveBeenCalledWith('device-item-not-reachable', false);
        expect(checkedDeviceItem.classList.toggle).toHaveBeenCalledWith('device-item-unreachable', true);
        expect(checkedDeviceItem.classList.add).toHaveBeenCalledWith('device-attention--failed');

        // A later silent (non-explicit) update for the same device must not re-animate it.
        (checkedDeviceItem.classList.add as jest.Mock).mockClear();
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: 'device-checked',
                status: 'unreachable',
                notReachable: false,
                unreachable: true,
                checking: false,
                checkedAt: '2026-09-22T09:10:00.000Z',
                explicit: false
            }]
        } });
        expect(checkedDeviceItem.classList.add).not.toHaveBeenCalledWith('device-attention--failed');
    });

    it('animates a device check initiated from another view (e.g. the manager) purely from the server broadcast', () => {
        function createFakeItem(attributes: Record<string, string>) {
            const classes = new Set<string>();
            return {
                getAttribute: jest.fn((name: string) => attributes[name] ?? null),
                classList: {
                    remove: jest.fn((...names: string[]) => names.forEach(n => classes.delete(n))),
                    add: jest.fn((name: string) => classes.add(name)),
                    contains: jest.fn((name: string) => classes.has(name)),
                    toggle: jest.fn((name: string, force?: boolean) => {
                        if (force === false) { classes.delete(name); return false; }
                        classes.add(name);
                        return true;
                    })
                }
            };
        }

        const remoteCheckedItem = createFakeItem({
            'data-id': 'device-remote',
            'data-device-status': 'reachable',
            'data-not-reachable': 'false',
            'data-reachability-checking': 'false',
            'data-reachability-checked-at': '2026-09-22T09:00:00.000Z'
        });
        const itemsById: Record<string, ReturnType<typeof createFakeItem>> = {
            'device-remote': remoteCheckedItem
        };

        const windowListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const documentMock = {
            addEventListener: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
                if (eventName === 'DOMContentLoaded') {
                    listener();
                }
            }),
            removeEventListener: jest.fn(),
            getElementById: jest.fn(() => null),
            querySelector: jest.fn((selector: string) => {
                const match = selector.match(/data-id="([^"]+)"/);
                return match ? itemsById[match[1]] ?? null : null;
            }),
            querySelectorAll: jest.fn((selector: string) => (
                selector === '.device-item[data-device-status]' ? Object.values(itemsById) : []
            ))
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock,
            window: {
                addEventListener: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
                    (windowListeners[eventName] = windowListeners[eventName] || []).push(listener);
                })
            }
        };
        const scriptPath = path.resolve(process.cwd(), 'src/views/devices/list/deviceList.js');
        const script = fs.readFileSync(scriptPath, 'utf8');

        vm.runInNewContext(script, context, { filename: scriptPath });

        // No button was clicked in this webview; the check was started elsewhere (the manager),
        // and this view learns about it purely from the shared store's broadcast.
        const messageHandler = windowListeners['message'][0];
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: 'device-remote',
                status: 'reachable',
                notReachable: false,
                checking: true,
                checkedAt: '2026-09-22T09:00:00.000Z',
                explicit: true
            }]
        } });

        expect(remoteCheckedItem.classList.add).toHaveBeenCalledWith('device-attention--checking');
    });
});
