/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for groupStore.
 * Validates state management and observable pattern implementation.
 */

import { GroupStore } from '../../store/groupStore';
import { ConnectXGroup } from '../../types/connectxGroup';

describe('groupStore', () => {
  let store: GroupStore;

  beforeEach(() => {
    store = new GroupStore();
  });

  describe('Basic Operations', () => {
    it('should start with empty state', () => {
      expect(store.getAll()).toEqual([]);
      expect(store.count()).toBe(0);
    });

    it('should add a group to the store', () => {
      const group: ConnectXGroup = createTestGroup('1', ['device-1', 'device-2']);
      
      store.set(group.id, group);
      
      expect(store.get(group.id)).toEqual(group);
      expect(store.count()).toBe(1);
    });

    it('should update an existing group', () => {
      const group: ConnectXGroup = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      const success = store.update(group.id, { metadata: { key: 'value' } });
      
      expect(success).toBe(true);
      const updated = store.get(group.id);
      expect(updated?.metadata).toEqual({ key: 'value' });
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should return false when updating non-existent group', () => {
      const success = store.update('non-existent', { metadata: { key: 'value' } });
      
      expect(success).toBe(false);
    });

    it('should delete a group from the store', () => {
      const group: ConnectXGroup = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      const success = store.delete(group.id);
      
      expect(success).toBe(true);
      expect(store.get(group.id)).toBeUndefined();
      expect(store.count()).toBe(0);
    });

    it('should return false when deleting non-existent group', () => {
      const success = store.delete('non-existent');
      
      expect(success).toBe(false);
    });

    it('should check if group exists', () => {
      const group: ConnectXGroup = createTestGroup('1', ['device-1', 'device-2']);
      
      expect(store.has(group.id)).toBe(false);
      
      store.set(group.id, group);
      
      expect(store.has(group.id)).toBe(true);
    });

    it('should replace group with same ID', () => {
      const group1: ConnectXGroup = createTestGroup('1', ['device-1', 'device-2']);
      const group2: ConnectXGroup = createTestGroup('1', ['device-3', 'device-4']);
      
      store.set(group1.id, group1);
      store.set(group2.id, group2);
      
      expect(store.count()).toBe(1);
      expect(store.get(group1.id)?.deviceIds).toEqual(['device-3', 'device-4']);
    });

    it('should clear all groups', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      store.set('2', createTestGroup('2', ['device-3', 'device-4']));
      store.set('3', createTestGroup('3', ['device-5', 'device-6']));
      
      expect(store.count()).toBe(3);
      
      store.clear();
      
      expect(store.count()).toBe(0);
      expect(store.getAll()).toEqual([]);
    });
  });

  describe('Bulk Operations', () => {
    it('should set multiple groups at once', () => {
      const groups: ConnectXGroup[] = [
        createTestGroup('1', ['device-1', 'device-2']),
        createTestGroup('2', ['device-3', 'device-4']),
        createTestGroup('3', ['device-5', 'device-6']),
      ];
      
      store.setMany(groups);
      
      expect(store.count()).toBe(3);
      expect(store.get('1')?.deviceIds).toEqual(['device-1', 'device-2']);
      expect(store.get('2')?.deviceIds).toEqual(['device-3', 'device-4']);
      expect(store.get('3')?.deviceIds).toEqual(['device-5', 'device-6']);
    });

    it('should find groups matching a predicate', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      store.set('2', createTestGroup('2', ['device-3', 'device-4']));
      store.set('3', createTestGroup('3', ['device-5', 'device-6']));
      
      const groups = store.find(g => g.id !== '2');
      
      expect(groups).toHaveLength(2);
      expect(groups.every(g => g.id === '1' || g.id === '3')).toBe(true);
    });
  });

  describe('Group-Specific Operations', () => {
    it('should find group by device ID', () => {
      const group1 = createTestGroup('1', ['device-1', 'device-2']);
      const group2 = createTestGroup('2', ['device-3', 'device-4']);
      
      store.set(group1.id, group1);
      store.set(group2.id, group2);
      
      const foundGroup = store.findByDevice('device-3');
      
      expect(foundGroup).toBeDefined();
      expect(foundGroup?.id).toBe('2');
      expect(foundGroup?.deviceIds).toContain('device-3');
    });

    it('should return undefined when device not in any group', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      
      const foundGroup = store.findByDevice('device-999');
      
      expect(foundGroup).toBeUndefined();
    });

    it('should find first matching group when device could be in multiple', () => {
      const group1 = createTestGroup('1', ['device-1', 'device-2']);
      const group2 = createTestGroup('2', ['device-1', 'device-3']);
      
      store.set(group1.id, group1);
      store.set(group2.id, group2);
      
      const foundGroup = store.findByDevice('device-1');
      
      expect(foundGroup).toBeDefined();
      expect(foundGroup?.deviceIds).toContain('device-1');
    });
  });

  describe('Observable Pattern', () => {
    it('should notify subscribers when group is added', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      
      const group = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([group]);
    });

    it('should notify subscribers when group is updated', () => {
      const group = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      const listener = jest.fn();
      store.subscribe(listener);
      
      store.update(group.id, { metadata: { key: 'value' } });
      
      expect(listener).toHaveBeenCalledTimes(1);
      const updatedGroups = listener.mock.calls[0][0];
      expect(updatedGroups[0].metadata).toEqual({ key: 'value' });
    });

    it('should notify subscribers when group is deleted', () => {
      const group = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      const listener = jest.fn();
      store.subscribe(listener);
      
      store.delete(group.id);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([]);
    });

    it('should notify subscribers when store is cleared', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      store.set('2', createTestGroup('2', ['device-3', 'device-4']));
      
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
      
      const group = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);
      
      const group1 = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group1.id, group1);
      
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      const group2 = createTestGroup('2', ['device-3', 'device-4']);
      store.set(group2.id, group2);
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in listeners gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      store.subscribe(errorListener);
      store.subscribe(goodListener);
      
      const group = createTestGroup('1', ['device-1', 'device-2']);
      
      expect(() => {
        store.set(group.id, group);
      }).not.toThrow();
      
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });

    it('should only notify once for bulk operations', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      
      const groups = [
        createTestGroup('1', ['device-1', 'device-2']),
        createTestGroup('2', ['device-3', 'device-4']),
        createTestGroup('3', ['device-5', 'device-6']),
      ];
      
      store.setMany(groups);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(groups);
    });
  });

  describe('JSON Import/Export', () => {
    it('should export groups as JSON', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      store.set('2', createTestGroup('2', ['device-3', 'device-4']));
      
      const json = store.toJSON();
      const parsed = JSON.parse(json);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].deviceIds).toBeDefined();
    });

    it('should import groups from JSON', () => {
      const groups = [
        createTestGroup('1', ['device-1', 'device-2']),
        createTestGroup('2', ['device-3', 'device-4']),
      ];
      const json = JSON.stringify(groups);
      
      store.fromJSON(json);
      
      expect(store.count()).toBe(2);
      expect(store.get('1')?.deviceIds).toEqual(['device-1', 'device-2']);
      expect(store.get('2')?.deviceIds).toEqual(['device-3', 'device-4']);
    });

    it('should clear existing data when importing', () => {
      store.set('old', createTestGroup('old', ['device-99', 'device-98']));
      
      const groups = [createTestGroup('1', ['device-1', 'device-2'])];
      const json = JSON.stringify(groups);
      
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
      }).toThrow('Invalid JSON: expected an array of groups');
    });
  });

  describe('getState', () => {
    it('should return current state via getState', () => {
      const group = createTestGroup('1', ['device-1', 'device-2']);
      store.set(group.id, group);
      
      const state = store.getState();
      
      expect(state).toEqual([group]);
    });

    it('should return same result as getAll', () => {
      store.set('1', createTestGroup('1', ['device-1', 'device-2']));
      store.set('2', createTestGroup('2', ['device-3', 'device-4']));
      
      expect(store.getState()).toEqual(store.getAll());
    });
  });
});

/**
 * Helper function to create test groups.
 */
function createTestGroup(
  id: string,
  deviceIds: string[]
): ConnectXGroup {
  return {
    id,
    deviceIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
