/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for deviceStore.
 * Validates state management and observable pattern implementation.
 */

import { DeviceStore } from '../../store/deviceStore';
import { Device } from '../../types/devices';

describe('deviceStore', () => {
  let store: DeviceStore;

  beforeEach(() => {
    store = new DeviceStore();
  });

  describe('Basic Operations', () => {
    it('should start with empty state', () => {
      expect(store.getAll()).toEqual([]);
      expect(store.count()).toBe(0);
    });

    it('should add a device to the store', () => {
      const device: Device = createTestDevice('1', 'Test device');
      
      store.set(device.id, device);
      
      expect(store.get(device.id)).toEqual(device);
      expect(store.count()).toBe(1);
    });

    it('should update an existing device', () => {
      const device: Device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      const success = store.update(device.id, { name: 'Updated Name' });
      
      expect(success).toBe(true);
      const updated = store.get(device.id);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should return false when updating non-existent device', () => {
      const success = store.update('non-existent', { name: 'Updated' });
      
      expect(success).toBe(false);
    });

    it('should delete a device from the store', () => {
      const device: Device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      const success = store.delete(device.id);
      
      expect(success).toBe(true);
      expect(store.get(device.id)).toBeUndefined();
      expect(store.count()).toBe(0);
    });

    it('should return false when deleting non-existent device', () => {
      const success = store.delete('non-existent');
      
      expect(success).toBe(false);
    });

    it('should check if device exists', () => {
      const device: Device = createTestDevice('1', 'Test device');
      
      expect(store.has(device.id)).toBe(false);
      
      store.set(device.id, device);
      
      expect(store.has(device.id)).toBe(true);
    });

    it('should replace device with same ID', () => {
      const device1: Device = createTestDevice('1', 'device 1');
      const device2: Device = createTestDevice('1', 'device 2');
      
      store.set(device1.id, device1);
      store.set(device2.id, device2);
      
      expect(store.count()).toBe(1);
      expect(store.get(device1.id)?.name).toBe('device 2');
    });

    it('should clear all devices', () => {
      store.set('1', createTestDevice('1', 'device 1'));
      store.set('2', createTestDevice('2', 'device 2'));
      store.set('3', createTestDevice('3', 'device 3'));
      
      expect(store.count()).toBe(3);
      
      store.clear();
      
      expect(store.count()).toBe(0);
      expect(store.getAll()).toEqual([]);
    });
  });

  describe('Bulk Operations', () => {
    it('should set multiple devices at once', () => {
      const devices: Device[] = [
        createTestDevice('1', 'device 1'),
        createTestDevice('2', 'device 2'),
        createTestDevice('3', 'device 3'),
      ];
      
      store.setMany(devices);
      
      expect(store.count()).toBe(3);
      expect(store.get('1')?.name).toBe('device 1');
      expect(store.get('2')?.name).toBe('device 2');
      expect(store.get('3')?.name).toBe('device 3');
    });

    it('should find devices matching a predicate', () => {
      store.set('1', createTestDevice('1', 'device 1'));
      store.set('2', createTestDevice('2', 'device 2'));
      store.set('3', createTestDevice('3', 'device 3'));
      
      const devices = store.find(m => m.id !== '2');
      
      expect(devices).toHaveLength(2);
      expect(devices.every(m => m.id === '1' || m.id === '3')).toBe(true);
    });
  });

  describe('Observable Pattern', () => {
    it('should notify subscribers when device is added', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      
      const device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([device]);
    });

    it('should notify subscribers when device is updated', () => {
      const device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      const listener = jest.fn();
      store.subscribe(listener);
      
      store.update(device.id, { name: 'Updated Name' });
      
      expect(listener).toHaveBeenCalledTimes(1);
      const updatedDevices = listener.mock.calls[0][0];
      expect(updatedDevices[0].name).toBe('Updated Name');
    });

    it('should notify subscribers when device is deleted', () => {
      const device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      const listener = jest.fn();
      store.subscribe(listener);
      
      store.delete(device.id);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([]);
    });

    it('should notify subscribers when store is cleared', () => {
      store.set('1', createTestDevice('1', 'device 1'));
      store.set('2', createTestDevice('2', 'device 2'));
      
      const listener = jest.fn();
      store.subscribe(listener);
      
      store.clear();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([]);
    });

    it('should support multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      store.subscribe(listener1);
      store.subscribe(listener2);
      store.subscribe(listener3);
      
      const device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);
      
      const device1 = createTestDevice('1', 'device 1');
      store.set(device1.id, device1);
      
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      const device2 = createTestDevice('2', 'device 2');
      store.set(device2.id, device2);
      
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should handle errors in listeners gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      store.subscribe(errorListener);
      store.subscribe(goodListener);
      
      const device = createTestDevice('1', 'Test device');
      
      expect(() => {
        store.set(device.id, device);
      }).not.toThrow();
      
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });

    it('should only notify once for bulk operations', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      
      const devices = [
        createTestDevice('1', 'device 1'),
        createTestDevice('2', 'device 2'),
        createTestDevice('3', 'device 3'),
      ];
      
      store.setMany(devices);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(devices);
    });
  });

  describe('JSON Import/Export', () => {
    it('should export devices as JSON', () => {
      store.set('1', createTestDevice('1', 'device 1'));
      store.set('2', createTestDevice('2', 'device 2'));
      
      const json = store.toJSON();
      const parsed = JSON.parse(json);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBeDefined();
    });

    it('should import devices from JSON', () => {
      const devices = [
        createTestDevice('1', 'device 1'),
        createTestDevice('2', 'device 2'),
      ];
      const json = JSON.stringify(devices);
      
      store.fromJSON(json);
      
      expect(store.count()).toBe(2);
      expect(store.get('1')?.name).toBe('device 1');
      expect(store.get('2')?.name).toBe('device 2');
    });

    it('should clear existing data when importing', () => {
      store.set('old', createTestDevice('old', 'Old device'));
      
      const devices = [createTestDevice('1', 'device 1')];
      const json = JSON.stringify(devices);
      
      store.fromJSON(json);
      
      expect(store.count()).toBe(1);
      expect(store.has('old')).toBe(false);
      expect(store.has('1')).toBe(true);
    });

    it('should throw error on invalid JSON', () => {
      expect(() => {
        store.fromJSON('invalid json');
      }).toThrow();
    });

    it('should throw error on non-array JSON', () => {
      expect(() => {
        store.fromJSON('{"not": "an array"}');
      }).toThrow('Invalid JSON: expected an array of devices');
    });
  });

  describe('getState', () => {
    it('should return current state via getState', () => {
      const device = createTestDevice('1', 'Test device');
      store.set(device.id, device);
      
      const state = store.getState();
      
      expect(state).toEqual([device]);
    });

    it('should return same result as getAll', () => {
      store.set('1', createTestDevice('1', 'device 1'));
      store.set('2', createTestDevice('2', 'device 2'));
      
      expect(store.getState()).toEqual(store.getAll());
    });
  });
});

/**
 * Helper function to create test devices.
 */
function createTestDevice(
  id: string,
  name: string
): Device {
  return {
    id,
    name,
    host: `192.168.1.${id}`,
    username: 'zgx',
    port: 22,
    isSetup: false,
    useKeyAuth: true,
    keySetup: {
      keyGenerated: false,
      keyCopied: false,
      connectionTested: false,
    },
    createdAt: new Date().toISOString(),
  };
}
