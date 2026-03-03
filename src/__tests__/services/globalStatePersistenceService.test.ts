/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for GlobalStatePersistenceService.
 * Validates device and group persistence to VS Code's global state.
 */

import { GlobalStatePersistenceService } from '../../services/globalStatePersistenceService';
import { DeviceStore } from '../../store/deviceStore';
import { GroupStore } from '../../store/groupStore';
import { Device } from '../../types/devices';
import { ConnectXGroup } from '../../types/connectxGroup';
import * as vscode from 'vscode';

// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }
}));

describe('GlobalStatePersistenceService', () => {
    let service: GlobalStatePersistenceService;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockDeviceStore: DeviceStore;
    let mockGroupStore: GroupStore;
    let mockGlobalState: Map<string, any>;
    let mockDevices: Device[];
    let mockGroups: ConnectXGroup[];

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        mockGlobalState = new Map();

        // Create mock devices
        mockDevices = [
            {
                id: 'device-1',
                name: 'Device 1',
                host: '192.168.1.101',
                username: 'user1',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            },
            {
                id: 'device-2',
                name: 'Device 2',
                host: '192.168.1.102',
                username: 'user2',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            }
        ];

        // Create mock groups
        mockGroups = [
            {
                id: 'group-1',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            }
        ];

        // Mock VS Code extension context
        mockContext = {
            globalState: {
                get: jest.fn((key: string, defaultValue?: any) => {
                    return mockGlobalState.get(key) ?? defaultValue;
                }),
                update: jest.fn(async (key: string, value: any) => {
                    if (value === undefined) {
                        mockGlobalState.delete(key);
                    } else {
                        mockGlobalState.set(key, value);
                    }
                }),
                keys: jest.fn(() => Array.from(mockGlobalState.keys())),
                setKeysForSync: jest.fn()
            },
            subscriptions: [],
            workspaceState: {} as any,
            secrets: {} as any,
            extensionUri: {} as any,
            extensionPath: '',
            environmentVariableCollection: {} as any,
            extensionMode: 3,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: {} as any,
            globalStoragePath: '',
            logUri: {} as any,
            logPath: '',
            extension: {} as any,
            languageModelAccessInformation: {} as any,
            asAbsolutePath: jest.fn((relativePath: string) => relativePath)
        } as any;

        // Create real stores
        mockDeviceStore = new DeviceStore();
        mockGroupStore = new GroupStore();

        // Create service
        service = new GlobalStatePersistenceService({
            context: mockContext,
            deviceStore: mockDeviceStore,
            groupStore: mockGroupStore
        });
    });

    afterEach(() => {
        service.dispose();
    });

    describe('initialize', () => {
        it('should initialize and set up subscriptions', async () => {
            await service.initialize();

            // Verify stores were loaded (even if empty)
            expect(mockContext.globalState.get).toHaveBeenCalled();
        });

        it('should load devices from storage on initialization', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);

            await service.initialize();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(2);
            expect(devices[0].id).toBe('device-1');
        });

        it('should load groups from storage on initialization', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);
            mockGlobalState.set('HPInc.zgx-toolkit.groups', mockGroups);

            // Load devices first so group validation passes
            await service.initialize();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(1);
            expect(groups[0].id).toBe('group-1');
        });
    });

    describe('loadDevices', () => {
        it('should load valid devices from storage', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);

            await service.loadDevices();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(2);
            expect(devices[0].id).toBe('device-1');
            expect(devices[1].id).toBe('device-2');
        });

        it('should skip invalid devices', async () => {
            const invalidDevices = [
                mockDevices[0],
                { id: 'invalid', name: 'Invalid' }, // Missing required fields
                mockDevices[1]
            ];
            mockGlobalState.set('HPInc.zgx-toolkit.devices', invalidDevices);

            await service.loadDevices();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(2); // Only valid devices loaded
        });

        it('should handle empty storage', async () => {
            await service.loadDevices();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(0);
        });

        it('should validate device port range', async () => {
            const invalidPortDevice: Device = {
                ...mockDevices[0],
                port: 99999 // Invalid port
            };
            mockGlobalState.set('HPInc.zgx-toolkit.devices', [invalidPortDevice]);

            await service.loadDevices();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(0); // Invalid device skipped
        });

        it('should migrate from legacy storage key', async () => {
            mockGlobalState.set('remoteDevices.devices', mockDevices);

            await service.loadDevices();

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(2);
        });
    });

    describe('loadGroups', () => {
        beforeEach(async () => {
            // Load devices first so group validation can reference them
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);
            await service.loadDevices();
        });

        it('should load valid groups from storage', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.groups', mockGroups);

            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(1);
            expect(groups[0].id).toBe('group-1');
        });

        it('should skip groups with missing required fields', async () => {
            const invalidGroups = [
                mockGroups[0],
                { id: 'invalid', deviceIds: ['device-1'] }, // Missing createdAt/updatedAt
            ];
            mockGlobalState.set('HPInc.zgx-toolkit.groups', invalidGroups);

            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(1); // Only valid group loaded
        });

        it('should skip groups with non-existent devices', async () => {
            const groupWithInvalidDevices: ConnectXGroup = {
                id: 'group-invalid',
                deviceIds: ['device-1', 'device-999'], // device-999 doesn't exist
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            };
            mockGlobalState.set('HPInc.zgx-toolkit.groups', [groupWithInvalidDevices]);

            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(0); // Group skipped (only 1 valid device)
        });

        it('should filter out non-existent devices from groups', async () => {
            const groupWithSomeInvalidDevices: ConnectXGroup = {
                id: 'group-mixed',
                deviceIds: ['device-1', 'device-2', 'device-999'], // device-999 doesn't exist
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            };
            mockGlobalState.set('HPInc.zgx-toolkit.groups', [groupWithSomeInvalidDevices]);

            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(1);
            expect(groups[0].deviceIds).toEqual(['device-1', 'device-2']); // device-999 filtered out
        });

        it('should skip groups with fewer than 2 valid devices', async () => {
            const groupWithOneDevice: ConnectXGroup = {
                id: 'group-single',
                deviceIds: ['device-1'],
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            };
            mockGlobalState.set('HPInc.zgx-toolkit.groups', [groupWithOneDevice]);

            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(0); // Group skipped (< 2 devices)
        });

        it('should handle empty storage', async () => {
            await service.loadGroups();

            const groups = mockGroupStore.getAll();
            expect(groups).toHaveLength(0);
        });
    });

    describe('auto-save on store changes', () => {
        it('should auto-save devices when device store changes', async () => {
            await service.initialize();

            const newDevice: Device = {
                ...mockDevices[0],
                id: 'device-new'
            };

            mockDeviceStore.set('device-new', newDevice);

            // Wait for async save
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.devices',
                expect.arrayContaining([expect.objectContaining({ id: 'device-new' })])
            );
        });

        it('should auto-save groups when group store changes', async () => {
            await service.initialize();

            const newGroup: ConnectXGroup = {
                id: 'group-new',
                deviceIds: ['device-1', 'device-2'],
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z'
            };

            mockGroupStore.set('group-new', newGroup);

            // Wait for async save
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.groups',
                expect.arrayContaining([expect.objectContaining({ id: 'group-new' })])
            );
        });
    });

    describe('forceSave', () => {
        it('should manually save all devices and groups', async () => {
            mockDeviceStore.setMany(mockDevices);
            mockGroupStore.setMany(mockGroups);

            await service.forceSave();

            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.devices',
                mockDevices
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.groups',
                mockGroups
            );
        });
    });

    describe('clearStorage', () => {
        it('should clear devices and groups from storage', async () => {
            mockDeviceStore.setMany(mockDevices);
            mockGroupStore.setMany(mockGroups);

            await service.clearStorage();

            expect(mockDeviceStore.getAll()).toHaveLength(0);
            expect(mockGroupStore.getAll()).toHaveLength(0);
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.devices',
                undefined
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'HPInc.zgx-toolkit.groups',
                undefined
            );
        });
    });

    describe('getRawDeviceData', () => {
        it('should return raw device data from storage', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);

            const data = await service.getRawDeviceData();

            expect(data).toEqual(mockDevices);
        });

        it('should return empty array if no data', async () => {
            const data = await service.getRawDeviceData();

            expect(data).toEqual([]);
        });
    });

    describe('getRawGroupData', () => {
        it('should return raw group data from storage', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.groups', mockGroups);

            const data = await service.getRawGroupData();

            expect(data).toEqual(mockGroups);
        });

        it('should return empty array if no data', async () => {
            const data = await service.getRawGroupData();

            expect(data).toEqual([]);
        });
    });

    describe('exportToJSON', () => {
        it('should export devices as JSON', () => {
            mockDeviceStore.setMany(mockDevices);

            const json = service.exportToJSON();
            const parsed = JSON.parse(json);

            expect(parsed).toHaveLength(2);
            expect(parsed[0].id).toBe('device-1');
        });
    });

    describe('importFromJSON', () => {
        it('should import valid devices from JSON', async () => {
            const json = JSON.stringify(mockDevices);

            await service.importFromJSON(json);

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(2);
        });

        it('should skip invalid devices during import', async () => {
            const invalidDevices = [
                mockDevices[0],
                { id: 'invalid', name: 'Invalid' }, // Missing required fields
            ];
            const json = JSON.stringify(invalidDevices);

            await service.importFromJSON(json);

            const devices = mockDeviceStore.getAll();
            expect(devices).toHaveLength(1); // Only valid device imported
        });

        it('should throw error for invalid JSON', async () => {
            await expect(service.importFromJSON('not json')).rejects.toThrow();
        });

        it('should throw error if JSON is not an array', async () => {
            await expect(service.importFromJSON('{}')).rejects.toThrow('Invalid JSON: expected an array of devices');
        });
    });

    describe('getStatistics', () => {
        it('should return storage statistics', async () => {
            mockGlobalState.set('HPInc.zgx-toolkit.devices', mockDevices);
            mockGlobalState.set('HPInc.zgx-toolkit.groups', mockGroups);

            const stats = await service.getStatistics();

            expect(stats.machineCount).toBe(2);
            expect(stats.groupCount).toBe(1);
            expect(stats.storageSize).toBeGreaterThan(0);
        });

        it('should return zero counts for empty storage', async () => {
            const stats = await service.getStatistics();

            expect(stats.machineCount).toBe(0);
            expect(stats.groupCount).toBe(0);
            expect(stats.storageSize).toBeGreaterThan(0); // JSON overhead
        });
    });

    describe('dispose', () => {
        it('should unsubscribe from store changes', async () => {
            await service.initialize();

            service.dispose();

            // Modify stores - should not trigger saves after dispose
            const updateCallsBefore = (mockContext.globalState.update as jest.Mock).mock.calls.length;
            
            mockDeviceStore.set('device-new', mockDevices[0]);
            
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const updateCallsAfter = (mockContext.globalState.update as jest.Mock).mock.calls.length;
            
            // No new update calls should have been made
            expect(updateCallsAfter).toBe(updateCallsBefore);
        });
    });
});
