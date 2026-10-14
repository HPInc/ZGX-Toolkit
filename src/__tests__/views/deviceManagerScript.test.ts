/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

/**
 * Minimal fake DOM element supporting the subset of the Element/HTMLInputElement/
 * HTMLFormElement API that deviceManager.js exercises (value, classList, attributes,
 * event listeners).
 */
function createFakeElement(id?: string) {
    const attributes: Record<string, string> = {};
    const classes = new Set<string>();
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        disabled: false,
        selectedIndex: 0,
        style: {} as Record<string, string>,
        _attributes: attributes,
        _listeners: listeners,
        getAttribute: jest.fn((name: string) => (name in attributes ? attributes[name] : null)),
        setAttribute: jest.fn((name: string, val: string) => { attributes[name] = val; }),
        addEventListener: jest.fn((event: string, handler: (...args: any[]) => void) => {
            (listeners[event] = listeners[event] || []).push(handler);
        }),
        removeEventListener: jest.fn(),
        classList: {
            add: jest.fn((c: string) => classes.add(c)),
            remove: jest.fn((c: string) => classes.delete(c)),
            contains: jest.fn((c: string) => classes.has(c)),
            toggle: jest.fn((c: string, force?: boolean) => {
                if (force === true) { classes.add(c); return true; }
                if (force === false) { classes.delete(c); return false; }
                if (classes.has(c)) { classes.delete(c); return false; }
                classes.add(c);
                return true;
            })
        },
        focus: jest.fn(),
        appendChild: jest.fn(),
        closest: jest.fn(() => null),
        querySelector: jest.fn(() => null),
        reset: jest.fn()
    };
}

type FakeElement = ReturnType<typeof createFakeElement>;

/**
 * Build a fake `document`/`window` context sufficient to run deviceManager.js and
 * exercise its edit/cancel/add-device form flows via captured event listeners.
 */
function createTestContext(deviceCardData: Record<string, string>) {
    const elementsById = new Map<string, FakeElement>();
    const documentListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const windowListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const editIconBtn = createFakeElement();
    editIconBtn.setAttribute('data-id', deviceCardData.id);

    const deviceCard = createFakeElement();
    deviceCard.setAttribute('data-id', deviceCardData.id);
    for (const [key, val] of Object.entries(deviceCardData)) {
        if (key === 'id') { continue; }
        deviceCard.setAttribute(`data-${key}`, val);
    }
    const statusElement = createFakeElement();
    const statusLabel = createFakeElement();
    (statusElement.querySelector as jest.Mock) = jest.fn((selector: string) => (
        selector === '[data-device-status-label]' ? statusLabel : null
    ));
    (deviceCard.querySelector as jest.Mock) = jest.fn((selector: string) => (
        selector === '[data-device-status]' ? statusElement : null
    ));

    const documentMock = {
        addEventListener: jest.fn((event: string, handler: (...args: any[]) => void) => {
            (documentListeners[event] = documentListeners[event] || []).push(handler);
        }),
        getElementById: jest.fn((id: string) => {
            if (!elementsById.has(id)) {
                elementsById.set(id, createFakeElement(id));
            }
            return elementsById.get(id);
        }),
        querySelectorAll: jest.fn((selector: string) => {
            if (selector === '.edit-icon') {
                return [editIconBtn];
            }
            if (selector === '.device-card[data-id]') {
                return [deviceCard];
            }
            return [];
        }),
        querySelector: jest.fn((selector: string) => {
            if (selector === `.device-card[data-id="${deviceCardData.id}"]`) {
                return deviceCard;
            }
            return null;
        }),
        createElement: jest.fn(() => createFakeElement())
    };

    const context = {
        acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
        document: documentMock,
        window: {
            addEventListener: jest.fn((event: string, handler: (...args: any[]) => void) => {
                (windowListeners[event] = windowListeners[event] || []).push(handler);
            })
        } as any
    };

    return { context, documentMock, documentListeners, windowListeners, elementsById, editIconBtn, deviceCard, statusElement, statusLabel };
}

describe('Device Manager webview script - edit/cancel/add form reset', () => {
    const scriptPath = path.resolve(process.cwd(), 'src/views/devices/manager/deviceManager.js');
    const script = fs.readFileSync(scriptPath, 'utf8');

    const testDevice = {
        id: 'device-1',
        name: 'Old Device',
        host: '192.168.1.50',
        username: 'olduser',
        port: '2222',
        'dns-instance-name': 'old-dns',
        'device-type': 'zgx_fury'
    };

    it('populates the form when editing, then clears it after cancel + Add Device (no stale data)', () => {
        const { context, documentMock, documentListeners, elementsById } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });

        // Trigger DOMContentLoaded to wire up all the button listeners
        expect(documentListeners['DOMContentLoaded']).toHaveLength(1);
        documentListeners['DOMContentLoaded'][0]();

        // Simulate clicking the edit pencil for the device (within Device Manager itself)
        const editIconBtn = documentMock.querySelectorAll('.edit-icon')[0] as FakeElement;
        const editClickHandler = editIconBtn._listeners['click'][0];
        editClickHandler.call(editIconBtn);

        const deviceName = elementsById.get('deviceName')!;
        const deviceHost = elementsById.get('deviceHost')!;
        const deviceUsername = elementsById.get('deviceUsername')!;
        const devicePort = elementsById.get('devicePort')!;
        const deviceType = elementsById.get('deviceType')!;

        // Sanity check: edit form was populated with the device's data
        expect(deviceName.value).toBe(testDevice.name);
        expect(deviceHost.value).toBe(testDevice.host);
        expect(deviceUsername.value).toBe(testDevice.username);
        expect(devicePort.value).toBe(testDevice.port);
        expect(deviceType.value).toBe(testDevice['device-type']);

        // Simulate clicking Cancel
        const cancelBtn = elementsById.get('cancelBtn')!;
        const cancelClickHandler = cancelBtn._listeners['click'][0];
        cancelClickHandler.call(cancelBtn);

        // Simulate clicking "Add Device" afterwards
        const showFormBtn = elementsById.get('showFormBtn')!;
        const showFormClickHandler = showFormBtn._listeners['click'][0];
        showFormClickHandler.call(showFormBtn);

        // The form must be blank, not pre-populated with the previously-edited device's data
        expect(deviceName.value).toBe('');
        expect(deviceHost.value).toBe('');
        expect(deviceUsername.value).toBe('');
        expect(devicePort.value).toBe('22');
        expect(deviceType.value).toBe('');
    });

    it('syncs form state with the extension so background refreshes preserve the active edit form', () => {
        const { context, documentMock, documentListeners, elementsById } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });
        documentListeners['DOMContentLoaded'][0]();

        const postMessage = (context.window.vscodeApi ?? context.acquireVsCodeApi()).postMessage as jest.Mock;

        const editIconBtn = documentMock.querySelectorAll('.edit-icon')[0] as FakeElement;
        editIconBtn._listeners['click'][0].call(editIconBtn);

        expect(postMessage).toHaveBeenCalledWith({
            type: 'device-form-state',
            mode: 'edit',
            deviceId: testDevice.id
        });

        const cancelBtn = elementsById.get('cancelBtn')!;
        cancelBtn._listeners['click'][0].call(cancelBtn);

        expect(postMessage).toHaveBeenCalledWith({
            type: 'device-form-state',
            mode: 'closed'
        });

        const showFormBtn = elementsById.get('showFormBtn')!;
        showFormBtn._listeners['click'][0].call(showFormBtn);

        expect(postMessage).toHaveBeenCalledWith({
            type: 'device-form-state',
            mode: 'add'
        });
    });

    it('refreshes reachability status without rewriting unchanged cards', () => {
        const { context, documentListeners, windowListeners, elementsById, deviceCard, statusElement, statusLabel } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });
        documentListeners['DOMContentLoaded'][0]();

        const refreshButton = elementsById.get('refreshStatusBtn')!;
        refreshButton._listeners['click'][0].call(refreshButton);
        expect(refreshButton.disabled).toBe(true);
        expect(elementsById.get('refreshStatusBtnText')!.textContent).toBe('Refreshing...');
        expect(elementsById.get('refreshStatusSpinner')!.classList.remove).toHaveBeenCalledWith('hidden');

        const messageHandler = windowListeners['message'][0];

        // The server tags this update as explicit (user-initiated), matching the Refresh Status
        // click above.
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'reachable',
                label: 'Reachable',
                notReachable: false,
                checking: false,
                explicit: true
            }],
            lastRefreshed: '09/18/2026 @ 10:00 AM'
        } });

        expect(deviceCard.classList.toggle).toHaveBeenCalledWith('device-card-not-reachable', false);
        expect(statusElement.className).toBe('device-status device-status-reachable');
        expect(statusLabel.textContent).toBe('Reachable');
        expect(elementsById.get('lastRefreshed')!.textContent).toBe('Last refreshed: 09/18/2026 @ 10:00 AM');

        const toggleCalls = (deviceCard.classList.toggle as jest.Mock).mock.calls.length;
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'reachable',
                label: 'Reachable',
                notReachable: false,
                checking: false,
                explicit: true
            }],
            lastRefreshed: '09/18/2026 @ 10:00 AM'
        } });
        expect((deviceCard.classList.toggle as jest.Mock).mock.calls.length).toBe(toggleCalls);

        // A background/silent reachability update (explicit: false) must not animate the card,
        // even though its status changed to unreachable.
        (deviceCard.classList.add as jest.Mock).mockClear();
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'unreachable',
                label: 'Unreachable',
                notReachable: false,
                unreachable: true,
                checking: false,
                checkedAt: '2026-09-22T09:59:00.000Z',
                explicit: false
            }],
            lastRefreshed: '09/22/2026 @ 09:59 AM'
        } });
        expect(deviceCard.classList.add).not.toHaveBeenCalledWith('device-attention--failed');

        // A new user-initiated check (explicit: true) animates checking/failed transitions again.
        refreshButton._listeners['click'][0].call(refreshButton);
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'reachable',
                label: 'Reachable',
                notReachable: false,
                checking: true,
                explicit: true
            }],
            lastRefreshed: '09/18/2026 @ 10:00 AM'
        } });

        expect(deviceCard.classList.add).toHaveBeenCalledWith('device-attention--checking');

        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'unreachable',
                label: 'Unreachable',
                notReachable: false,
                unreachable: true,
                checking: false,
                checkedAt: '2026-09-22T10:00:00.000Z',
                explicit: true
            }],
            lastRefreshed: '09/22/2026 @ 10:00 AM'
        } });

        expect(deviceCard.classList.remove).toHaveBeenCalledWith(
            'device-attention--connecting',
            'device-attention--checking',
            'device-attention--failed'
        );
        expect(deviceCard.classList.add).toHaveBeenCalledWith('device-attention--failed');

        messageHandler({ data: { type: 'reachability-refresh-completed' } });
        expect(refreshButton.disabled).toBe(false);
        expect(elementsById.get('refreshStatusBtnText')!.textContent).toBe('Refresh Status');
        expect(elementsById.get('refreshStatusSpinner')!.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('animates a device check initiated from another view (e.g. the sidebar) purely from the server broadcast', () => {
        const { context, documentListeners, windowListeners, deviceCard } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });
        documentListeners['DOMContentLoaded'][0]();

        // No button was clicked in this webview; the check was started elsewhere (the sidebar),
        // and this view learns about it purely from the shared store's broadcast.
        const messageHandler = windowListeners['message'][0];
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: testDevice.id,
                status: 'reachable',
                label: 'Reachable',
                notReachable: false,
                checking: true,
                explicit: true
            }],
            lastRefreshed: '09/18/2026 @ 10:00 AM'
        } });

        expect(deviceCard.classList.add).toHaveBeenCalledWith('device-attention--checking');
    });

    it('does not replay the failure animation on an unrelated already-unreachable device when another device is checked', () => {
        function createFakeCard(attributes: Record<string, string>) {
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
                },
                querySelector: jest.fn(() => null)
            };
        }

        // Rendered on page load: already unreachable from a past explicit "Check Status" click.
        const unrelatedCard = createFakeCard({
            'data-id': 'device-unreachable',
            'data-device-status': 'unreachable',
            'data-device-status-label': 'Unreachable',
            'data-not-reachable': 'false',
            'data-unreachable': 'true',
            'data-reachability-checking': 'false',
            'data-reachability-checked-at': '2026-09-22T09:00:00.000Z',
            'data-reachability-explicit': 'true'
        });
        const cardsById: Record<string, ReturnType<typeof createFakeCard>> = {
            'device-unreachable': unrelatedCard
        };

        const windowListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const documentMock = {
            addEventListener: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
                if (event === 'DOMContentLoaded') { handler(); }
            }),
            getElementById: jest.fn(() => null),
            querySelector: jest.fn((selector: string) => {
                const match = selector.match(/data-id="([^"]+)"/);
                return match ? cardsById[match[1]] ?? null : null;
            }),
            querySelectorAll: jest.fn((selector: string) => (
                selector === '.device-card[data-device-status]' ? Object.values(cardsById) : []
            ))
        };
        const context = {
            acquireVsCodeApi: jest.fn(() => ({ postMessage: jest.fn() })),
            document: documentMock,
            window: {
                addEventListener: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
                    (windowListeners[event] = windowListeners[event] || []).push(handler);
                })
            }
        };

        vm.runInNewContext(script, context, { filename: scriptPath });

        // Disconnecting an unrelated device triggers a reachability check for it alone, but the
        // store broadcasts every device's current status, including this unchanged one.
        const messageHandler = windowListeners['message'][0];
        messageHandler({ data: {
            type: 'reachability-status-updated',
            statuses: [{
                deviceId: 'device-unreachable',
                status: 'unreachable',
                label: 'Unreachable',
                notReachable: false,
                unreachable: true,
                checking: false,
                checkedAt: '2026-09-22T09:00:00.000Z',
                explicit: true
            }],
            lastRefreshed: '09/22/2026 @ 09:00 AM'
        } });

        expect(unrelatedCard.classList.add).not.toHaveBeenCalledWith('device-attention--failed');
    });

    it('preserves a manually entered device name when a discovered device is selected', () => {
        const { context, documentMock, documentListeners, windowListeners, elementsById } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });
        documentListeners['DOMContentLoaded'][0]();

        const deviceName = documentMock.getElementById('deviceName')!;
        const deviceHost = documentMock.getElementById('deviceHost')!;
        deviceName.value = 'Manually Entered Name';
        deviceName._listeners['input'][0].call(deviceName);

        const discoveryButton = elementsById.get('discoverBtn')!;
        const discoveryClickHandler = discoveryButton._listeners['click'][0];
        discoveryClickHandler.call(discoveryButton);

        const messageHandler = windowListeners['message'][0];
        messageHandler({
            data: {
                type: 'discoveryCompleted',
                devices: [{ hostname: 'zgx-device', addresses: ['192.168.1.60'] }]
            }
        });

        const dropdown = elementsById.get('devicesDropdown')!;
        const option = dropdown.appendChild.mock.calls[0][0] as FakeElement;
        option._listeners['click'][0].call(option, { preventDefault: jest.fn(), stopPropagation: jest.fn() });

        expect(deviceName.value).toBe('Manually Entered Name');
        expect(deviceHost.value).toBe('192.168.1.60');
    });

    it('updates the device name when no name was manually entered', () => {
        const { context, documentMock, documentListeners, windowListeners, elementsById } = createTestContext(testDevice);

        vm.runInNewContext(script, context, { filename: scriptPath });
        documentListeners['DOMContentLoaded'][0]();

        const deviceName = documentMock.getElementById('deviceName')!;
        const discoveryButton = elementsById.get('discoverBtn')!;
        discoveryButton._listeners['click'][0].call(discoveryButton);

        const messageHandler = windowListeners['message'][0];
        messageHandler({
            data: {
                type: 'discoveryCompleted',
                devices: [
                    { hostname: 'first-device', addresses: ['192.168.1.60'] },
                    { hostname: 'second-device', addresses: ['192.168.1.61'] }
                ]
            }
        });

        const dropdown = elementsById.get('devicesDropdown')!;
        const firstOption = dropdown.appendChild.mock.calls[0][0] as FakeElement;
        firstOption._listeners['click'][0].call(firstOption, { preventDefault: jest.fn(), stopPropagation: jest.fn() });
        expect(deviceName.value).toBe('first-device');

        const secondOption = dropdown.appendChild.mock.calls[1][0] as FakeElement;
        secondOption._listeners['click'][0].call(secondOption, { preventDefault: jest.fn(), stopPropagation: jest.fn() });
        expect(deviceName.value).toBe('second-device');
    });
});
