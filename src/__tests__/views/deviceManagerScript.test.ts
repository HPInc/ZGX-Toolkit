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

    const editIconBtn = createFakeElement();
    editIconBtn.setAttribute('data-id', deviceCardData.id);

    const deviceCard = createFakeElement();
    for (const [key, val] of Object.entries(deviceCardData)) {
        if (key === 'id') { continue; }
        deviceCard.setAttribute(`data-${key}`, val);
    }

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
        window: { addEventListener: jest.fn() } as any
    };

    return { context, documentMock, documentListeners, elementsById, editIconBtn };
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

        vm.runInNewContext(script, context);

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
});
