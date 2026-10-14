/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import { DeviceReachabilityCheckService } from '../../services/deviceReachabilityCheckService';
import { deviceReachabilityStore } from '../../store';
import { connectionStateStore } from '../../store/connectionStateStore';
import { Device } from '../../types/devices';
import { DeviceStatus } from '../../types/devicestatus';

jest.mock('net', () => ({
    createConnection: jest.fn()
}));

describe('DeviceReachabilityCheckService', () => {
    const device = { id: 'device-1', name: 'Device 1', host: '127.0.0.1', port: 22 } as Device;
    let service: DeviceReachabilityCheckService;

    beforeEach(() => {
        service = new DeviceReachabilityCheckService();
        deviceReachabilityStore.clear();
        connectionStateStore.clear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        deviceReachabilityStore.clear();
        connectionStateStore.clear();
    });

    function socketFor(event: 'connect' | 'error' | 'timeout', value?: Error): net.Socket {
        const socket = new EventEmitter() as net.Socket;
        socket.destroy = jest.fn();
        (net.createConnection as jest.Mock).mockImplementation(() => {
            queueMicrotask(() => socket.emit(event, value));
            return socket;
        });
        return socket;
    }

    it('marks a device reachable after a successful connection', async () => {
        const socket = socketFor('connect');

        await service.checkDevicesReachability([device]);

        expect(deviceReachabilityStore.get(device.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Reachable,
            checking: false
        }));
        expect(socket.destroy).toHaveBeenCalled();
        expect(deviceReachabilityStore.getLastQueryTimestamp()).not.toBe('Never');
    });

    it('notifies subscribers only twice per query regardless of device count', async () => {
        const listener = jest.fn();
        deviceReachabilityStore.subscribe(listener);
        const device2 = { id: 'device-2', name: 'Device 2', host: '127.0.0.2', port: 22 } as Device;
        const sockets: net.Socket[] = [];
        (net.createConnection as jest.Mock).mockImplementation(() => {
            const socket = new EventEmitter() as net.Socket;
            socket.destroy = jest.fn();
            sockets.push(socket);
            queueMicrotask(() => socket.emit('connect'));
            return socket;
        });

        await service.checkDevicesReachability([device, device2]);

        // One notify when both devices start checking, one when the query completes.
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('skips connected devices while checking the remaining devices', async () => {
        const connectedDevice = { ...device, id: 'device-connected' };
        const otherDevice = { ...device, id: 'device-other' };
        connectionStateStore.reconcile([{
            deviceId: connectedDevice.id,
            connectLabel: 'root@127.0.0.1',
            windowId: 'another-window',
            connectedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString()
        }]);
        const socket = socketFor('connect');

        await service.checkDevicesReachability([connectedDevice, otherDevice], true);

        expect(net.createConnection).toHaveBeenCalledTimes(1);
        expect(deviceReachabilityStore.get(connectedDevice.id)).toBeUndefined();
        expect(deviceReachabilityStore.get(otherDevice.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Reachable,
            checking: false
        }));
        expect(deviceReachabilityStore.isExplicitCheck(connectedDevice.id)).toBe(false);
        expect(deviceReachabilityStore.isExplicitCheck(otherDevice.id)).toBe(true);
        expect(socket.destroy).toHaveBeenCalled();
    });

    it('stores socket errors and timeouts as unreachable results', async () => {
        const errorSocket = socketFor('error', new Error('connection refused'));
        await service.checkDevicesReachability([device]);
        expect(deviceReachabilityStore.get(device.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Unreachable,
            error: 'connection refused'
        }));
        expect(errorSocket.destroy).toHaveBeenCalled();

        deviceReachabilityStore.clear();
        const timeoutSocket = socketFor('timeout');
        await service.checkDevicesReachability([device]);
        expect(deviceReachabilityStore.get(device.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Unreachable,
            error: 'Connection timed out'
        }));
        expect(timeoutSocket.destroy).toHaveBeenCalled();
    });

    it('ignores a second socket event after the probe has settled', async () => {
        const socket = new EventEmitter() as net.Socket;
        socket.destroy = jest.fn();
        (net.createConnection as jest.Mock).mockImplementation(() => {
            queueMicrotask(() => {
                socket.emit('connect');
                socket.emit('error', new Error('late error'));
            });
            return socket;
        });

        await service.checkDevicesReachability([device]);

        expect(socket.destroy).toHaveBeenCalledTimes(1);
        expect(deviceReachabilityStore.get(device.id)?.status).toBe(DeviceStatus.Reachable);
    });

    it('discards a stale result when an older, slower check is superseded by a newer one', async () => {
        const sockets: net.Socket[] = [];
        (net.createConnection as jest.Mock).mockImplementation(() => {
            const socket = new EventEmitter() as net.Socket;
            socket.destroy = jest.fn();
            sockets.push(socket);
            return socket;
        });

        // Start an older check (e.g. the background updater), then a newer one (e.g. a manual
        // "Check Status" click) before the older one has resolved.
        const olderCheck = service.checkDevicesReachability([device]);
        const newerCheck = service.checkDevicesReachability([device]);

        // The newer check wins the race and reports the device reachable.
        sockets[1].emit('connect');
        await newerCheck;
        expect(deviceReachabilityStore.get(device.id)?.status).toBe(DeviceStatus.Reachable);

        // The older, slower check then fails - its result is stale and must not regress the store.
        sockets[0].emit('error', new Error('stale failure'));
        await olderCheck;

        expect(deviceReachabilityStore.get(device.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Reachable,
            checking: false
        }));
    });

    it('handles a synchronous connection creation failure', async () => {
        (net.createConnection as jest.Mock).mockImplementation(() => {
            throw new Error('invalid address');
        });

        await service.checkDevicesReachability([device]);

        expect(deviceReachabilityStore.get(device.id)).toEqual(expect.objectContaining({
            status: DeviceStatus.Unreachable,
            error: 'invalid address'
        }));
    });

    it('handles non-Error connection failures and empty device lists', async () => {
        (net.createConnection as jest.Mock).mockImplementation(() => {
            throw 'bad connection';
        });

        await service.checkDevicesReachability([]);
        expect(deviceReachabilityStore.getLastQueryTimestamp()).not.toBe('Never');

        await service.checkDevicesReachability([device]);
        expect(deviceReachabilityStore.get(device.id)?.error).toBe('bad connection');
    });

    it('completes the query when the input collection fails unexpectedly', async () => {
        await service.checkDevicesReachability(undefined as unknown as Device[]);

        expect(deviceReachabilityStore.getLastQueryTimestamp()).not.toBe('Never');
    });
});