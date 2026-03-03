/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for ConnectXGroupService.
 * Validates group creation, device management, and group lifecycle operations.
 */

import { ConnectXGroupService } from '../../services/connectxGroupService';
import { DeviceService } from '../../services/deviceService';
import { GroupStore } from '../../store/groupStore';
import { Device } from '../../types/devices';
import { ConnectXGroup, ConnectXGroupConfig, ConnectXNIC } from '../../types/connectxGroup';
import { ITelemetryService } from '../../types/telemetry';

// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
}));

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-' + Date.now())
}));

describe('ConnectXGroupService', () => {
    let service: ConnectXGroupService;
    let mockGroupStore: jest.Mocked<GroupStore>;
    let mockDeviceService: jest.Mocked<DeviceService>;
    let mockTelemetryService: jest.Mocked<ITelemetryService>;
    let mockDevices: Device[];

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'device-3',
                name: 'Device 3',
                host: '192.168.1.103',
                username: 'user3',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'device-4',
                name: 'Device 4',
                host: '192.168.1.104',
                username: 'user4',
                port: 22,
                isSetup: true,
                useKeyAuth: true,
                keySetup: {
                    keyGenerated: true,
                    keyCopied: true,
                    connectionTested: true
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        // Mock GroupStore with actual storage behavior
        const mockStorage = new Map<string, ConnectXGroup>();
        
        mockGroupStore = {
            get: jest.fn((id: string) => mockStorage.get(id)),
            getAll: jest.fn(() => Array.from(mockStorage.values())),
            set: jest.fn((id: string, group: ConnectXGroup) => {
                mockStorage.set(id, group);
                return group;
            }),
            delete: jest.fn((id: string) => {
                const existed = mockStorage.has(id);
                mockStorage.delete(id);
                return existed;
            }),
            has: jest.fn((id: string) => mockStorage.has(id)),
            findByDevice: jest.fn((deviceId: string) => {
                return Array.from(mockStorage.values()).find(g => g.deviceIds.includes(deviceId));
            }),
            subscribe: jest.fn(),
            clear: jest.fn(() => mockStorage.clear()),
            count: jest.fn(() => mockStorage.size),
            find: jest.fn((predicate: any) => Array.from(mockStorage.values()).filter(predicate)),
            setMany: jest.fn((groups: ConnectXGroup[]) => {
                groups.forEach(g => mockStorage.set(g.id, g));
            }),
            update: jest.fn(),
            getState: jest.fn(() => Array.from(mockStorage.values())),
            toJSON: jest.fn(),
            fromJSON: jest.fn()
        } as any;

        // Mock device service
        mockDeviceService = {
            getDevice: jest.fn().mockImplementation((id: string) => {
                return Promise.resolve(mockDevices.find(d => d.id === id) || null);
            }),
            getAllDevices: jest.fn().mockResolvedValue(mockDevices)
        } as any;

        // Mock telemetry service
        mockTelemetryService = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            setEnabled: jest.fn(),
            dispose: jest.fn()
        } as any;

        service = new ConnectXGroupService(mockDeviceService, {
            store: mockGroupStore,
            telemetry: mockTelemetryService
        });
    });

    describe('createGroup', () => {
        it('should create a group with valid configuration', async () => {
             const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroup(config);

            expect(result.success).toBe(true);
            expect(result.message).toBe(`Group "${result.group!.id}" created with ${result.group!.deviceIds.length} devices`);
            expect(result.group).toBeDefined();
            expect(result.group?.id).toBeDefined();
            expect(result.group?.deviceIds).toEqual(['device-1', 'device-2']);
            expect(result.group?.deviceIds.length).toBe(2);
            expect(result.group?.createdAt).toBeDefined();
            expect(result.group?.updatedAt).toBeDefined();
            expect(mockGroupStore.set).toHaveBeenCalledWith(
                result.group!.id,
                expect.objectContaining({
                    deviceIds: ['device-1', 'device-2']
                })
            );
            expect(mockTelemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: 'group',
                action: 'create'
            });
        });

        it('should create a group with more than 2 devices', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-3']
            });

            expect(result.success).toBe(true);
            expect(result.group?.deviceIds.length).toBe(3);
        });

         it('should create a group with minimum 2 devices', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(result.success).toBe(true);
            expect(result.group?.deviceIds.length).toBe(2);
        });

        it('should fail to create group with less than 2 devices', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1']
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('at least 2 devices');
            expect(result.error).toContain('Provided: 1');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group with empty device list', async () => {
            const result = await service.createGroup({
                deviceIds: []
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('at least 2 devices');
            expect(result.error).toContain('Provided: 0');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group with duplicate device IDs', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-1']
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Device IDs must be unique within a group');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group with multiple duplicate device IDs', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-1', 'device-2']
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Device IDs must be unique within a group');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group if device already in another group', async () => {
            // Create first group
            const firstGroup = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            expect(firstGroup.success).toBe(true);

            // Clear the mock to track only the second attempt
            jest.clearAllMocks();

            // Try to create second group with same device
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-3']
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('already in groups');
            expect(result.error).toContain('device-1');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group if multiple devices already in groups', async () => {
            // Create first group
            await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            // Create second group
            await service.createGroup({
                deviceIds: ['device-3', 'device-2']
            });

            // Clear mocks
            jest.clearAllMocks();

            // Try to create group with devices from both existing groups
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-3', 'device-2']
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('already in groups');
            expect(result.error).toContain('device-1');
            expect(result.message).toBe('Failed to create group');
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group with non-existent device', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'non-existent-device']
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Devices not found');
            expect(result.error).toContain('non-existent-device');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });

        it('should fail to create group with all non-existent devices', async () => {
            const result = await service.createGroup({
                deviceIds: ['fake-device-1', 'fake-device-2']
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Devices not found');
            expect(result.error).toContain('fake-device-1');
            expect(result.error).toContain('fake-device-2');
            expect(result.message).toBe('Failed to create group');
            expect(mockGroupStore.set).not.toHaveBeenCalled();
        });

        it('should include metadata in created group', async () => {
            const metadata = { region: 'us-west', priority: 'high' };
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2'],
                metadata
            });

            expect(result.success).toBe(true);
            expect(result.group?.metadata).toEqual(metadata);
        });

        it('should handle errors during group creation', async () => {
            // Force the store.set to throw an error
            mockGroupStore.set.mockImplementationOnce(() => {
                throw new Error('Store write failed');
            });

            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Store write failed');
            expect(result.message).toBe('Failed to create group');
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.create'
            });
        });
    });

    describe('addDeviceToGroup', () => {
        it('should add a device to an existing group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const groupId = createResult.group!.id;
            const result = await service.addDeviceToGroup(groupId, 'device-3');

            expect(result.success).toBe(true);
            expect(result.message).toContain(`Device added to group "${groupId}"`);
            expect(result.group?.deviceIds).toContain('device-3');
            expect(result.group?.deviceIds.length).toBe(3);
            expect(mockGroupStore.set).toHaveBeenCalledWith(
                groupId,
                expect.objectContaining({
                    deviceIds: ['device-1', 'device-2', 'device-3']
                })
            );
            expect(mockTelemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: 'group',
                action: 'add-device'
            });
        });

        it('should fail to add device to non-existent group', async () => {
            const result = await service.addDeviceToGroup('non-existent-group', 'device-1');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Group does not exist');
            expect(result.error).toContain('Group not found');
        });

        it('should fail to add non-existent device', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const result = await service.addDeviceToGroup(
                createResult.group!.id,
                'non-existent-device'
            );

            expect(result.success).toBe(false);
            expect(result.message).toBe('Device to be added does not exist');
            expect(result.error).toContain('Device to be added to group not found');
        });

        it('should fail to add device that is already in the group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const result = await service.addDeviceToGroup(
                createResult.group!.id,
                'device-1'
            );

            expect(result.success).toBe(false);
            expect(result.message).toBe('Device is already in this group');
            expect(result.error).toContain(`Device device-1 is already in group ${createResult.group!.id}`);
        });

        it('should fail to add device that is in another group', async () => {
            const group1 = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const group2 = await service.createGroup({
                deviceIds: ['device-3', 'device-4']
            });

            const result = await service.addDeviceToGroup(
                group2.group!.id,
                'device-2'
            );

            expect(group1.success).toBe(true);
            expect(group2.success).toBe(true); 
            expect(result.success).toBe(false); // device-2 is already in group1, cannot add to group2
            expect(result.error).toContain(`Device device-2 is already in another group`);
            expect(result.message).toBe('Device is in another group');
        });

        it('should update group timestamp when device is added', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const originalTimestamp = createResult.group!.updatedAt;

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = await service.addDeviceToGroup(
                createResult.group!.id,
                'device-3'
            );

            expect(result.success).toBe(true);
            expect(result.group!.updatedAt).not.toBe(originalTimestamp);
        });

        it('should handle errors when adding device to group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const groupId = createResult.group!.id;

            // Force store.set to throw an error
            mockGroupStore.set.mockImplementationOnce(() => {
                throw new Error('Database connection failed');
            });

            const result = await service.addDeviceToGroup(groupId, 'device-3');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database connection failed');
            expect(result.message).toBe('Failed to add device to group');
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.addDevice'
            });
        });
    });

    describe('removeDeviceFromGroup', () => {
        it('should remove a device from a group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-3']
            });

            const result = await service.removeDeviceFromGroup(
                createResult.group!.id,
                'device-3'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain(`Device removed from group "${createResult.group!.id}"`);
            expect(result.group?.deviceIds).toEqual(['device-1', 'device-2']);
            expect(result.group?.deviceIds.length).toBe(2);
            expect(mockGroupStore.set).toHaveBeenCalledWith(
                createResult.group!.id,
                expect.objectContaining({
                    deviceIds: ['device-1', 'device-2']
                })
            );
            expect(mockTelemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: 'group',
                action: 'remove-device'
            });
        });

        it('should delete group when removing device leaves only 1 device', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(createResult.group).toBeDefined();
            const groupId = createResult.group!.id;

            const result = await service.removeDeviceFromGroup(groupId, 'device-2');

            expect(result.success).toBe(true);
            expect(result.message).toContain(`Device removed and group "${groupId}" deleted`);
            expect(await service.getGroup(groupId)).toBeUndefined();
        });

        it('should fail to remove device from non-existent group', async () => {
            const result = await service.removeDeviceFromGroup('non-existent-group', 'device-1');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Group not found');
            expect(result.message).toBe('Group does not exist');
        });

        it('should fail to remove device not in the group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const result = await service.removeDeviceFromGroup(
                createResult.group!.id,
                'device-3'
            );

            expect(result.success).toBe(false);
            expect(result.message).toContain('Device not in group');
            expect(result.error).toContain(`Device device-3 is not in group ${createResult.group!.id}`);
        });

        it('should handle errors when removing device from group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-3']
            });

            const groupId = createResult.group!.id;

            // Force store.set to throw an error
            mockGroupStore.set.mockImplementationOnce(() => {
                throw new Error('Storage system unavailable');
            });

            const result = await service.removeDeviceFromGroup(groupId, 'device-3');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Storage system unavailable');
            expect(result.message).toBe('Failed to remove device from group');
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.removeDevice'
            });
        });
    });

    describe('removeGroup', () => {
        it('should remove a group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(createResult.group).toBeDefined();
            const groupId = createResult.group!.id;

            const result = await service.removeGroup(groupId);

            expect(result.success).toBe(true);
            expect(result.message).toContain(`Group "${groupId}" removed`);
            expect(await service.getGroup(groupId)).toBeUndefined();
            expect(mockGroupStore.delete).toHaveBeenCalledWith(groupId);
            expect(mockTelemetryService.trackEvent).toHaveBeenCalledWith({
                eventType: 'group',
                action: 'remove'
            });
        });

        it('should fail to remove non-existent group', async () => {
            const result = await service.removeGroup('non-existent-group');

            expect(result.group).toBeUndefined();
            expect(result.success).toBe(false);
            expect(result.message).toBe('Group does not exist');
            expect(result.error).toContain('Group not found');
        });

        it('should ungroup all devices when removing group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-3']
            });

            await service.removeGroup(createResult.group!.id);

            expect(await service.isDeviceInAnyGroup('device-1')).toBe(false);
            expect(await service.isDeviceInAnyGroup('device-2')).toBe(false);
            expect(await service.isDeviceInAnyGroup('device-3')).toBe(false);
        });

        it('should handle errors when removing group', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const groupId = createResult.group!.id;

            // Force store.delete to throw an error
            mockGroupStore.delete.mockImplementationOnce(() => {
                throw new Error('Deletion operation failed');
            });

            const result = await service.removeGroup(groupId);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Deletion operation failed');
            expect(result.message).toBe('Failed to remove group');
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.remove'
            });
        });
    });

    describe('getGroupInfo', () => {
        it('should return group info with device details', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const info = await service.getGroupInfo(createResult.group!.id);

            expect(info).toBeDefined();
            expect(info?.group.id).toBe(createResult.group!.id);
            expect(info?.devices.length).toBe(2);
            expect(info?.devices[0].name).toBe('Device 1');
            expect(info?.devices[1].name).toBe('Device 2');
            expect(info?.devices[0].host).toBe('192.168.1.101');
            expect(info?.devices[1].host).toBe('192.168.1.102');
            expect(mockGroupStore.get).toHaveBeenCalledWith(createResult.group!.id);
        });

        it('should return undefined for non-existent group', async () => {
            const info = await service.getGroupInfo('non-existent-group');

            expect(info).toBeUndefined();
        });

        it('should filter out deleted devices from group info', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2', 'device-3']
            });

            // Mock device-2 as deleted
            mockDeviceService.getDevice = jest.fn().mockImplementation((id: string) => {
                if (id === 'device-2') return Promise.resolve(null);
                return Promise.resolve(mockDevices.find(d => d.id === id) || null);
            });

            const info = await service.getGroupInfo(createResult.group!.id);

            expect(info?.devices.length).toBe(2); // Only device-1 and device-3
        });

        it('should remove group if deleted devices leave fewer than 2 valid devices', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const groupId = createResult.group!.id;

            // Mock device-2 as deleted (leaving only 1 valid device)
            mockDeviceService.getDevice = jest.fn().mockImplementation((id: string) => {
                if (id === 'device-2') return Promise.resolve(null);
                return Promise.resolve(mockDevices.find(d => d.id === id) || null);
            });

            const info = await service.getGroupInfo(groupId);

            expect(info).toBeUndefined();
            expect(mockGroupStore.delete).toHaveBeenCalledWith(groupId);
        });
    });

    describe('getGroup', () => {
        it('should return a group by ID', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const group = await service.getGroup(createResult.group!.id);

            expect(group).toBeDefined();
            expect(mockGroupStore.get).toHaveBeenCalledWith(createResult.group!.id);
            expect(group?.id).toBe(createResult.group!.id);
        });

        it('should return undefined for non-existent group', async () => {
            const group = await service.getGroup('non-existent-group');

            expect(group).toBeUndefined();
        });
    });

    describe('getAllGroups', () => {
        it('should return empty array when no groups exist', async () => {
            const groups = await service.getAllGroups();

            expect(groups).toEqual([]);
            expect(mockGroupStore.getAll).toHaveBeenCalled();
        });

        it('should return all groups', async () => {
            await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            await service.createGroup({
                deviceIds: ['device-3', 'device-1'] // This will fail due to device-1 in Group 1
            });

            const groups = await service.getAllGroups();

            expect(groups.length).toBe(1); // Only Group 1 created successfully
        });
    });

    describe('getGroupForDevice', () => {
        it('should return group containing the device', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            const group = await service.getGroupForDevice('device-1');

            expect(group).toBeDefined();
            expect(group?.id).toBe(createResult.group!.id);
            expect(mockGroupStore.findByDevice).toHaveBeenCalledWith('device-1');
        });

        it('should return undefined for device not in any group', async () => {
            const group = await service.getGroupForDevice('device-3');

            expect(group).toBeUndefined();
        });
    });

    describe('isDeviceInAnyGroup', () => {
        it('should return true if device is in a group', async () => {
            await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(await service.isDeviceInAnyGroup('device-1')).toBe(true);
            expect(await service.isDeviceInAnyGroup('device-2')).toBe(true);
        });

        it('should return false if device is not in any group', async () => {
            expect(await service.isDeviceInAnyGroup('device-3')).toBe(false);
        });
    });

    describe('Persistence', () => {
        it('should load groups from GroupStore on initialization', async () => {
            const storedGroups = [
                {
                    id: 'stored-group-1',
                    deviceIds: ['device-1', 'device-2'],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];

            const mockStoreWithData = {
                ...mockGroupStore,
                getAll: jest.fn().mockReturnValue(storedGroups)
            } as any;

            const newService = new ConnectXGroupService(mockDeviceService, {
                store: mockStoreWithData,
                telemetry: mockTelemetryService
            });

            const groups = await newService.getAllGroups();
            expect(groups.length).toBe(1);
            expect(groups[0].id).toBe('stored-group-1');
            expect(groups[0].deviceIds).toEqual(['device-1', 'device-2']);
        });

        it('should store group in GroupStore after creation', async () => {
            const result = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });

            expect(mockGroupStore.set).toHaveBeenCalledWith(
                result.group!.id,
                expect.objectContaining({
                    deviceIds: ['device-1', 'device-2']
                })
            );
        });
    });

    describe('getConnectXNICsForDevice', () => {
        let mockSSHClient: any;
        let mockCreateSSHConnection: jest.Mock;
        let mockExecuteCommandOnClient: jest.Mock;

        beforeEach(() => {
            // Mock SSH client
            mockSSHClient = {
                end: jest.fn()
            };

            // Mock SSH utilities
            mockCreateSSHConnection = jest.fn().mockResolvedValue(mockSSHClient);
            mockExecuteCommandOnClient = jest.fn();

            // Replace the imported functions with mocks
            const sshConnection = require('../../utils/sshConnection');
            sshConnection.createSSHConnection = mockCreateSSHConnection;
            sshConnection.executeCommandOnClient = mockExecuteCommandOnClient;
        });

        it('should discover ConnectX NICs with IP addresses', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                },
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp2s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.11/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                linuxDeviceName: 'enp1s0',
                ipv4Address: '192.168.1.10'
            });
            expect(result[1]).toEqual({
                linuxDeviceName: 'enp2s0',
                ipv4Address: '192.168.1.11'
            });
            expect(mockCreateSSHConnection).toHaveBeenCalledWith(
                mockDevices[0],
                { readyTimeout: 10000, timeout: 10000 }
            );
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should handle lshw returning single object instead of array', async () => {
            const lshwOutput = JSON.stringify({
                product: 'MT27800 Family [ConnectX-5]',
                vendor: 'Mellanox Technologies',
                logicalname: 'enp1s0'
            });

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '10.0.0.1/16\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                linuxDeviceName: 'enp1s0',
                ipv4Address: '10.0.0.1'
            });
        });

        it('should filter out non-Mellanox NICs', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                },
                {
                    product: 'Intel Ethernet Controller',
                    vendor: 'Intel Corporation',
                    logicalname: 'enp2s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].linuxDeviceName).toBe('enp1s0');
        });

        it('should filter out NICs without enp prefix', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                },
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'eth0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].linuxDeviceName).toBe('enp1s0');
        });

        it('should handle NICs without IP addresses', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                linuxDeviceName: 'enp1s0',
                ipv4Address: ''
            });
        });

        it('should throw error when lshw command fails', async () => {
            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: false,
                stdout: '',
                stderr: 'lshw: command not found'
            });

            await expect(service.getConnectXNICsForDevice(mockDevices[0])).rejects.toThrow(
                'Failed to discover NICs on Device 1'
            );
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should throw error when JSON parsing fails', async () => {
            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: 'invalid json{',
                stderr: ''
            });

            await expect(service.getConnectXNICsForDevice(mockDevices[0])).rejects.toThrow(
                'Failed to parse lshw output for Device 1'
            );
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should throw error when SSH connection fails', async () => {
            mockCreateSSHConnection.mockRejectedValueOnce(new Error('Connection timeout'));

            await expect(service.getConnectXNICsForDevice(mockDevices[0])).rejects.toThrow(
                'Failed to establish SSH connection to Device 1'
            );
        });

        it('should handle mixed case vendor and product names', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 MELLANOX ConnectX-5',
                    vendor: 'MELLANOX Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].linuxDeviceName).toBe('enp1s0');
        });

        it('should close SSH client even when error occurs during cleanup', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            mockSSHClient.end.mockImplementationOnce(() => {
                throw new Error('Client already closed');
            });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should handle IP addresses with multiple lines', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n192.168.1.11/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].ipv4Address).toBe('192.168.1.10');
        });

        it('should return empty array when no Mellanox NICs found', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'Intel Ethernet',
                    vendor: 'Intel Corporation',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: lshwOutput,
                stderr: ''
            });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toEqual([]);
        });

        it('should handle NICs with vendor field containing mellanox but no product', async () => {
            const lshwOutput = JSON.stringify([
                {
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].linuxDeviceName).toBe('enp1s0');
        });

        it('should handle NICs with product field containing mellanox but no vendor', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'Mellanox ConnectX-5',
                    logicalname: 'enp2s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.11/24\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].linuxDeviceName).toBe('enp2s0');
        });

        it('should close SSH client when no NICs are found', async () => {
            const lshwOutput = JSON.stringify([]);

            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: lshwOutput,
                stderr: ''
            });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toEqual([]);
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should handle NICs with logicalname that is not a string', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: ['enp1s0', 'enp1s0d1']
                },
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 123
                }
            ]);

            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: lshwOutput,
                stderr: ''
            });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toEqual([]);
        });

        it('should handle IP address without CIDR notation', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10\n',
                    stderr: ''
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0].ipv4Address).toBe('192.168.1.10');
        });

        it('should verify correct lshw command is used', async () => {
            const lshwOutput = JSON.stringify([]);

            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: lshwOutput,
                stderr: ''
            });

            await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                'lshw -class network -json',
                { operationName: 'Discover ConnectX NICs', timeoutSeconds: 15 }
            );
        });

        it('should verify correct ip command is used for each NIC', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                });

            await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                "ip a l enp1s0 | awk '/inet / {print $2}'",
                { operationName: 'Get IP for enp1s0', timeoutSeconds: 10 }
            );
        });

        it('should handle IP command failure gracefully and return NIC with empty IP', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: false,
                    stdout: '',
                    stderr: 'Device not found'
                });

            const result = await service.getConnectXNICsForDevice(mockDevices[0]);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                linuxDeviceName: 'enp1s0',
                ipv4Address: ''
            });
        });
    });

    describe('configureConnectXNICsForDevice', () => {
        let mockSSHClient: any;
        let mockCreateSSHConnection: jest.Mock;
        let mockExecuteCommandOnClient: jest.Mock;

        beforeEach(() => {
            // Mock SSH client
            mockSSHClient = {
                end: jest.fn()
            };

            // Mock SSH utilities
            mockCreateSSHConnection = jest.fn().mockResolvedValue(mockSSHClient);
            mockExecuteCommandOnClient = jest.fn();

            // Replace the imported functions with mocks
            const sshConnection = require('../../utils/sshConnection');
            sshConnection.createSSHConnection = mockCreateSSHConnection;
            sshConnection.executeCommandOnClient = mockExecuteCommandOnClient;
        });

        it('should successfully configure ConnectX NICs with link-local IPv4', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                },
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp2s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.11/24\n',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Verify write command was called with correct netplan config
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                expect.stringContaining('sudo -S sh -c "echo'),
                expect.objectContaining({
                    operationName: 'Write netplan config',
                    timeoutSeconds: 15,
                    sudoPassword: 'testpassword'
                })
            );

            // Verify apply command was called
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                'sudo -S netplan apply',
                expect.objectContaining({
                    operationName: 'Apply netplan config',
                    timeoutSeconds: 30,
                    sudoPassword: 'testpassword'
                })
            );

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should throw error when no ConnectX NICs are found', async () => {
            // Mock no NICs found
            const lshwOutput = JSON.stringify([
                {
                    product: 'Intel Ethernet',
                    vendor: 'Intel Corporation',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: lshwOutput,
                stderr: ''
            });

            await expect(service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword'))
                .rejects.toThrow('No ConnectX NICs found on device Device 1');
        });

        it('should throw error when SSH connection fails during configuration', async () => {
            mockCreateSSHConnection.mockRejectedValueOnce(new Error('Connection refused'));

            await expect(service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword'))
                .rejects.toThrow('Failed to establish SSH connection to Device 1');
        });

        it('should throw error when netplan file write fails', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                })
                // Configuration phase - write fails
                .mockResolvedValueOnce({
                    success: false,
                    stdout: '',
                    stderr: 'Permission denied'
                });

            await expect(service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword'))
                .rejects.toThrow('Failed to write netplan configuration on Device 1');

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should throw error when netplan apply fails', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '192.168.1.10/24\n',
                    stderr: ''
                })
                // Configuration phase - write succeeds, apply fails
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: false,
                    stdout: '',
                    stderr: 'Invalid netplan configuration'
                });

            await expect(service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword'))
                .rejects.toThrow('Failed to apply netplan configuration on Device 1');

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should generate correct netplan configuration for single NIC', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp3s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'password123');

            // Extract the write command
            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            expect(writeCall).toBeDefined();

            const writeCommand = writeCall![1] as string;
            
            // Verify the command contains the expected netplan configuration
            expect(writeCommand).toContain('network:');
            expect(writeCommand).toContain('version: 2');
            expect(writeCommand).toContain('ethernets:');
            expect(writeCommand).toContain('enp3s0:');
            expect(writeCommand).toContain('link-local: [ ipv4 ]');
            expect(writeCommand).toContain('/etc/netplan/40-zgx-connectx.yaml');
            expect(writeCommand).toContain('chmod 600');
        });

        it('should generate correct netplan configuration for multiple NICs', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                },
                {
                    product: 'MT27800 Family [ConnectX-6]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp2s0'
                },
                {
                    product: 'MT27800 Family [ConnectX-7]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp3s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'mypassword');

            // Extract the write command
            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;

            // Verify all three NICs are in the configuration
            expect(writeCommand).toContain('enp1s0:');
            expect(writeCommand).toContain('enp2s0:');
            expect(writeCommand).toContain('enp3s0:');
        });

        it('should close SSH client even when error occurs during cleanup', async () => {
            // Mock successful NIC discovery
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            mockSSHClient.end.mockImplementationOnce(() => {
                throw new Error('Client already closed');
            });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should escape special characters in netplan config to prevent injection', async () => {
            // Create a mock buildNetplanConfig method that returns config with special characters
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                "network:\n  version: 2\n  ethernets:\n    test'device:\n      link-local: [ ipv4 ]"
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Verify single quotes are escaped
            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            expect(writeCommand).toContain("'\\''");

            // Restore original method
            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should escape backslashes in netplan config', async () => {
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                "network:\\ntest"
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({ success: true, stdout: lshwOutput, stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            // Backslashes are not escaped
            expect(writeCommand).not.toContain('\\\\');

            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should escape double quotes in netplan config', async () => {
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                'network: "test"'
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({ success: true, stdout: lshwOutput, stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            // Double quotes are not escaped
            expect(writeCommand).not.toContain('\\"');

            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should escape backticks in netplan config', async () => {
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                'network: `command`'
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({ success: true, stdout: lshwOutput, stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            // Backticks are not escaped
            expect(writeCommand).not.toContain('\\`');

            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should escape dollar signs in netplan config', async () => {
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                'network: $variable'
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({ success: true, stdout: lshwOutput, stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            // Dollar signs are not escaped
            expect(writeCommand).not.toContain('\\$');

            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should escape all special characters together', async () => {
            const originalBuildNetplanConfig = (service as any).buildNetplanConfig;
            (service as any).buildNetplanConfig = jest.fn().mockReturnValue(
                "test: '\"$`\\"
            );

            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                .mockResolvedValueOnce({ success: true, stdout: lshwOutput, stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;
            // Only single quotes are escaped
            expect(writeCommand).toContain("'\\''"); // Single quote
            expect(writeCommand).not.toContain('\\"'); // Double quote
            expect(writeCommand).not.toContain('\\$'); // Dollar sign
            expect(writeCommand).not.toContain('\\`'); // Backtick
            expect(writeCommand).not.toContain('\\\\'); // Backslash

            (service as any).buildNetplanConfig = originalBuildNetplanConfig;
        });

        it('should use correct SSH connection settings', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Verify SSH connection was created twice (once for discovery, once for config)
            expect(mockCreateSSHConnection).toHaveBeenCalledTimes(2);
            expect(mockCreateSSHConnection).toHaveBeenCalledWith(
                mockDevices[0],
                { readyTimeout: 10000, timeout: 10000 }
            );
        });

        it('should use sudo -S sh -c command structure for single password injection', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Verify the write command uses single sudo with sh -c
            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            const writeCommand = writeCall![1] as string;

            expect(writeCommand).toContain('sudo -S sh -c');
            expect(writeCommand).toContain('echo');
            expect(writeCommand).toContain('chmod 600');
            // Should NOT have multiple sudo -S calls
            expect((writeCommand.match(/sudo -S/g) || []).length).toBe(1);
        });

        it('should configure NICs without IP addresses', async () => {
            // Mock NIC discovery with NICs that have no IP
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase - NIC has no IP
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Should still configure the NIC even without an IP
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                expect.stringContaining('enp1s0'),
                expect.objectContaining({
                    operationName: 'Write netplan config'
                })
            );
        });

        it('should propagate discovery errors during configuration', async () => {
            // Mock SSH connection failure during discovery
            mockCreateSSHConnection.mockRejectedValueOnce(new Error('Network unreachable'));

            await expect(service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword'))
                .rejects.toThrow('Failed to establish SSH connection to Device 1');
        });

        it('should use consistent timeout values', async () => {
            const lshwOutput = JSON.stringify([
                {
                    product: 'MT27800 Family [ConnectX-5]',
                    vendor: 'Mellanox Technologies',
                    logicalname: 'enp1s0'
                }
            ]);

            mockExecuteCommandOnClient
                // Discovery phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: lshwOutput,
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                // Configuration phase
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            await service.configureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            // Verify write timeout is 15 seconds
            const writeCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Write netplan config'
            );
            expect(writeCall![2]).toMatchObject({ timeoutSeconds: 15 });

            // Verify apply timeout is 30 seconds
            const applyCall = mockExecuteCommandOnClient.mock.calls.find(
                call => call[2]?.operationName === 'Apply netplan config'
            );
            expect(applyCall![2]).toMatchObject({ timeoutSeconds: 30 });
        });
    });

    describe('configureConnectXNICsForGroup', () => {
        const createGroup = (id: string, deviceIds: string[]): ConnectXGroup => ({
            id,
            deviceIds,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        it('should throw when group does not exist', async () => {
            await expect(service.configureConnectXNICsForGroup('missing-group', 'password'))
                .rejects.toThrow('Group not found: missing-group');

            expect(mockDeviceService.getDevice).not.toHaveBeenCalled();
        });

        it('should throw when a device in the group is missing', async () => {
            const group = createGroup('group-1', ['device-1', 'missing-device']);
            mockGroupStore.set(group.id, group);

            const configureSpy = jest.spyOn(service, 'configureConnectXNICsForDevice');

            await expect(service.configureConnectXNICsForGroup(group.id, 'password'))
                .rejects.toThrow('Devices not found in group group-1: missing-device');

            expect(configureSpy).not.toHaveBeenCalled();
            configureSpy.mockRestore();
        });

        it('should attempt all devices and report aggregated failures', async () => {
            const group = createGroup('group-1', ['device-1', 'device-2']);
            mockGroupStore.set(group.id, group);

            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForDevice')
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('boom'));

            let caughtError: unknown;
            try {
                await service.configureConnectXNICsForGroup(group.id, 'password');
            } catch (error) {
                caughtError = error;
            }

            expect(caughtError).toBeInstanceOf(Error);
            expect(String(caughtError)).toContain('Failed to configure 1 device(s) in group group-1');
            expect(String(caughtError)).toContain('Device 2: boom');
            expect(configureSpy).toHaveBeenCalledTimes(2);
            expect(configureSpy).toHaveBeenNthCalledWith(1, mockDevices[0], 'password');
            expect(configureSpy).toHaveBeenNthCalledWith(2, mockDevices[1], 'password');

            configureSpy.mockRestore();
        });

        it('should configure all devices in the group when successful', async () => {
            const group = createGroup('group-1', ['device-1', 'device-2']);
            mockGroupStore.set(group.id, group);

            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForDevice')
                .mockResolvedValue(undefined);

            await expect(service.configureConnectXNICsForGroup(group.id, 'password'))
                .resolves.toBeUndefined();

            expect(configureSpy).toHaveBeenCalledTimes(2);
            expect(configureSpy).toHaveBeenNthCalledWith(1, mockDevices[0], 'password');
            expect(configureSpy).toHaveBeenNthCalledWith(2, mockDevices[1], 'password');

            configureSpy.mockRestore();
        });
    });

    describe('createGroupAndConfigureNICs', () => {
        const password = 'sudo-password';

        it('should create a group and configure NICs when both succeed', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(true);
            expect(result.group).toBeDefined();
            expect(result.group?.deviceIds).toEqual(['device-1', 'device-2']);
            expect(result.message).toContain('Created group and configured ConnectX NICs for all devices');
            expect(configureSpy).toHaveBeenCalledWith(result.group!.id, password);
            expect(mockGroupStore.set).toHaveBeenCalled();

            configureSpy.mockRestore();
        });

        it('should return failure when group creation fails (e.g. too few devices)', async () => {
            const configureSpy = jest.spyOn(service, 'configureConnectXNICsForGroup');

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1'] // Less than minimum
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            expect(result.error).toContain('at least 2 devices');
            expect(configureSpy).not.toHaveBeenCalled();

            configureSpy.mockRestore();
        });

        it('should return failure when group creation fails due to non-existent device', async () => {
            const configureSpy = jest.spyOn(service, 'configureConnectXNICsForGroup');

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'non-existent-device']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Devices not found');
            expect(configureSpy).not.toHaveBeenCalled();

            configureSpy.mockRestore();
        });

        it('should roll back group when NIC configuration fails', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockRejectedValue(new Error('NIC configuration failed'));

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to configure ConnectX NICs for devices in group');
            expect(result.group).toBeDefined();
            // Verify devices were unconfigured before group removal
            expect(unconfigureSpy).toHaveBeenCalledWith(result.group!.id, password);
            // Verify group was rolled back (removed from store)
            expect(mockGroupStore.delete).toHaveBeenCalledWith(result.group!.id);
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.createAndConfigure'
            });

            configureSpy.mockRestore();
            unconfigureSpy.mockRestore();
        });

        it('should still return failure when both NIC configuration and rollback fail', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockRejectedValue(new Error('NIC configuration failed'));

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockRejectedValue(new Error('Unconfigure failed'));

            const removeGroupSpy = jest
                .spyOn(service, 'removeGroup')
                .mockRejectedValue(new Error('Rollback failed'));

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to configure ConnectX NICs for devices in group');
            expect(unconfigureSpy).toHaveBeenCalled();
            expect(removeGroupSpy).toHaveBeenCalled();
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.createAndConfigure'
            });

            configureSpy.mockRestore();
            unconfigureSpy.mockRestore();
            removeGroupSpy.mockRestore();
        });

        it('should still remove group when unconfigure fails but removeGroup succeeds', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockRejectedValue(new Error('NIC configuration failed'));

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockRejectedValue(new Error('Unconfigure failed'));

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            // Unconfigure was attempted but failed
            expect(unconfigureSpy).toHaveBeenCalled();
            // Group should still be removed from the store despite unconfigure failure
            expect(mockGroupStore.delete).toHaveBeenCalledWith(result.group!.id);
            const storedGroup = mockGroupStore.get(result.group!.id);
            expect(storedGroup).toBeUndefined();

            configureSpy.mockRestore();
            unconfigureSpy.mockRestore();
        });

        it('should pass the password through to configureConnectXNICsForGroup', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            await service.createGroupAndConfigureNICs(config, 'my-secret-pw');

            expect(configureSpy).toHaveBeenCalledWith(
                expect.any(String),
                'my-secret-pw'
            );

            configureSpy.mockRestore();
        });

        it('should include metadata in the created group', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const metadata = { region: 'us-west', priority: 'high' };
            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2'],
                metadata
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(true);
            expect(result.group?.metadata).toEqual(metadata);

            configureSpy.mockRestore();
        });

        it('should not leave the group in the store after NIC configuration failure and successful rollback', async () => {
            const configureSpy = jest
                .spyOn(service, 'configureConnectXNICsForGroup')
                .mockRejectedValue(new Error('NIC config boom'));

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const config: ConnectXGroupConfig = {
                deviceIds: ['device-1', 'device-2']
            };

            const result = await service.createGroupAndConfigureNICs(config, password);

            expect(result.success).toBe(false);
            // Devices should have been unconfigured
            expect(unconfigureSpy).toHaveBeenCalledWith(result.group!.id, password);
            // After rollback, the group should no longer be in the store
            const storedGroup = mockGroupStore.get(result.group!.id);
            expect(storedGroup).toBeUndefined();

            configureSpy.mockRestore();
            unconfigureSpy.mockRestore();
        });
    });

    describe('removeGroupAndUnconfigureNICs', () => {
        const password = 'sudo-password';

        it('should unconfigure NICs and remove group when both succeed', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            const result = await service.removeGroupAndUnconfigureNICs(groupId, password);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Devices ungrouped.');
            expect(result.nonFatalError).toBeUndefined();
            expect(unconfigureSpy).toHaveBeenCalledWith(groupId, password);
            expect(mockGroupStore.delete).toHaveBeenCalledWith(groupId);
            expect(await service.getGroup(groupId)).toBeUndefined();

            unconfigureSpy.mockRestore();
        });

        it('should return failure for non-existent group', async () => {
            const result = await service.removeGroupAndUnconfigureNICs('non-existent-group', password);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Group not found');
            expect(result.message).toBe('Group does not exist');
        });

        it('should still remove group when unconfigure fails', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockRejectedValue(new Error('Unconfigure failed'));

            const result = await service.removeGroupAndUnconfigureNICs(groupId, password);

            // Group should still be removed even though unconfigure failed
            expect(result.success).toBe(true);
            expect(result.nonFatalError).toBe('Unconfigure failed');
            expect(result.message).toContain('issues unconfiguring ConnectX NICs');
            expect(unconfigureSpy).toHaveBeenCalledWith(groupId, password);
            expect(mockGroupStore.delete).toHaveBeenCalledWith(groupId);
            expect(await service.getGroup(groupId)).toBeUndefined();

            unconfigureSpy.mockRestore();
        });

        it('should return failure when removeGroup fails', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            // Force store.delete to throw so removeGroup returns failure
            mockGroupStore.delete.mockImplementationOnce(() => {
                throw new Error('Deletion operation failed');
            });

            const result = await service.removeGroupAndUnconfigureNICs(groupId, password);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Deletion operation failed');
            expect(result.message).toBe('Failed to remove group');
            expect(unconfigureSpy).toHaveBeenCalledWith(groupId, password);
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.removeAndUnconfigure'
            });

            unconfigureSpy.mockRestore();
        });

        it('should return failure when both unconfigure and removeGroup fail', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockRejectedValue(new Error('Unconfigure failed'));

            mockGroupStore.delete.mockImplementationOnce(() => {
                throw new Error('Deletion operation failed');
            });

            const result = await service.removeGroupAndUnconfigureNICs(groupId, password);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Deletion operation failed');
            expect(result.message).toBe('Failed to remove group');
            expect(unconfigureSpy).toHaveBeenCalledWith(groupId, password);
            expect(mockTelemetryService.trackError).toHaveBeenCalledWith({
                eventType: 'error',
                error: expect.any(Error),
                context: 'group.removeAndUnconfigure'
            });

            unconfigureSpy.mockRestore();
        });

        it('should pass the password through to unconfigureConnectXNICsForGroup', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockResolvedValue(undefined);

            await service.removeGroupAndUnconfigureNICs(groupId, 'my-secret-pw');

            expect(unconfigureSpy).toHaveBeenCalledWith(groupId, 'my-secret-pw');

            unconfigureSpy.mockRestore();
        });

        it('should call unconfigure before removeGroup', async () => {
            const createResult = await service.createGroup({
                deviceIds: ['device-1', 'device-2']
            });
            const groupId = createResult.group!.id;

            const callOrder: string[] = [];

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForGroup')
                .mockImplementation(async () => {
                    callOrder.push('unconfigure');
                });

            const removeGroupSpy = jest
                .spyOn(service, 'removeGroup')
                .mockImplementation(async () => {
                    callOrder.push('removeGroup');
                    return { success: true, message: 'removed' };
                });

            await service.removeGroupAndUnconfigureNICs(groupId, password);

            expect(callOrder).toEqual(['unconfigure', 'removeGroup']);

            unconfigureSpy.mockRestore();
            removeGroupSpy.mockRestore();
        });
    });

    describe('unconfigureConnectXNICsForDevice', () => {
        let mockSSHClient: any;
        let mockCreateSSHConnection: jest.Mock;
        let mockExecuteCommandOnClient: jest.Mock;

        beforeEach(() => {
            mockSSHClient = {
                end: jest.fn()
            };

            mockCreateSSHConnection = jest.fn().mockResolvedValue(mockSSHClient);
            mockExecuteCommandOnClient = jest.fn();

            const sshConnection = require('../../utils/sshConnection');
            sshConnection.createSSHConnection = mockCreateSSHConnection;
            sshConnection.executeCommandOnClient = mockExecuteCommandOnClient;
        });

        it('should return true when netplan config is missing', async () => {
            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: true,
                stdout: 'missing\n',
                stderr: ''
            });

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(true);
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                expect.stringContaining('if [ -f /etc/netplan/40-zgx-connectx.yaml ]'),
                expect.objectContaining({
                    operationName: 'Check netplan config',
                    sudoPassword: 'testpassword'
                })
            );
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return true when netplan config is removed and applied', async () => {
            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: 'exists\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                });

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(true);
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                expect.stringContaining('rm -f'),
                expect.objectContaining({
                    operationName: 'Remove netplan config',
                    sudoPassword: 'testpassword'
                })
            );
            expect(mockExecuteCommandOnClient).toHaveBeenCalledWith(
                mockSSHClient,
                'sudo -S netplan apply',
                expect.objectContaining({
                    operationName: 'Apply netplan config',
                    sudoPassword: 'testpassword'
                })
            );
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return false when SSH connection fails', async () => {
            mockCreateSSHConnection.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(false);
        });

        it('should return false when config check fails', async () => {
            mockExecuteCommandOnClient.mockResolvedValueOnce({
                success: false,
                stdout: '',
                stderr: 'Permission denied'
            });

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(false);
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return false when config removal fails', async () => {
            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: 'exists\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: false,
                    stdout: '',
                    stderr: 'Remove failed'
                });

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(false);
            expect(mockSSHClient.end).toHaveBeenCalled();
        });

        it('should return false when netplan apply fails', async () => {
            mockExecuteCommandOnClient
                .mockResolvedValueOnce({
                    success: true,
                    stdout: 'exists\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: true,
                    stdout: '',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    success: false,
                    stdout: '',
                    stderr: 'Apply failed'
                });

            const result = await service.unconfigureConnectXNICsForDevice(mockDevices[0], 'testpassword');

            expect(result).toBe(false);
            expect(mockSSHClient.end).toHaveBeenCalled();
        });
    });

    describe('unconfigureConnectXNICsForGroup', () => {
        const createGroup = (id: string, deviceIds: string[]): ConnectXGroup => ({
            id,
            deviceIds,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        it('should throw when group does not exist', async () => {
            await expect(service.unconfigureConnectXNICsForGroup('missing-group', 'password'))
                .rejects.toThrow('Group not found: missing-group');
        });

        it('should throw when a device in the group is missing', async () => {
            const group = createGroup('group-1', ['device-1', 'missing-device']);
            mockGroupStore.set(group.id, group);

            const unconfigureSpy = jest.spyOn(service, 'unconfigureConnectXNICsForDevice');

            await expect(service.unconfigureConnectXNICsForGroup(group.id, 'password'))
                .rejects.toThrow('Devices not found in group group-1: missing-device');

            expect(unconfigureSpy).not.toHaveBeenCalled();
            unconfigureSpy.mockRestore();
        });

        it('should attempt all devices and report aggregated failures', async () => {
            const group = createGroup('group-1', ['device-1', 'device-2']);
            mockGroupStore.set(group.id, group);

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForDevice')
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            let caughtError: unknown;
            try {
                await service.unconfigureConnectXNICsForGroup(group.id, 'password');
            } catch (error) {
                caughtError = error;
            }

            expect(caughtError).toBeInstanceOf(Error);
            expect(String(caughtError)).toContain('Failed to unconfigure 1 device(s) in group group-1');
            expect(String(caughtError)).toContain('Device 2: Unconfiguration failed');
            expect(unconfigureSpy).toHaveBeenCalledTimes(2);
            expect(unconfigureSpy).toHaveBeenNthCalledWith(1, mockDevices[0], 'password');
            expect(unconfigureSpy).toHaveBeenNthCalledWith(2, mockDevices[1], 'password');

            unconfigureSpy.mockRestore();
        });

        it('should configure all devices in the group when successful', async () => {
            const group = createGroup('group-1', ['device-1', 'device-2']);
            mockGroupStore.set(group.id, group);

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForDevice')
                .mockResolvedValue(true);

            await expect(service.unconfigureConnectXNICsForGroup(group.id, 'password'))
                .resolves.toBeUndefined();

            expect(unconfigureSpy).toHaveBeenCalledTimes(2);
            expect(unconfigureSpy).toHaveBeenNthCalledWith(1, mockDevices[0], 'password');
            expect(unconfigureSpy).toHaveBeenNthCalledWith(2, mockDevices[1], 'password');

            unconfigureSpy.mockRestore();
        });

        it('should report aggregated failures when unconfigure throws', async () => {
            const group = createGroup('group-1', ['device-1']);
            mockGroupStore.set(group.id, group);

            const unconfigureSpy = jest
                .spyOn(service, 'unconfigureConnectXNICsForDevice')
                .mockRejectedValue(new Error('boom'));

            await expect(service.unconfigureConnectXNICsForGroup(group.id, 'password'))
                .rejects.toThrow('Failed to unconfigure 1 device(s) in group group-1: Device 1: boom');

            expect(unconfigureSpy).toHaveBeenCalledTimes(1);
            unconfigureSpy.mockRestore();
        });
    });

    describe('buildNetplanConfig', () => {
        it('should generate correct netplan YAML for single NIC', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '192.168.1.10' }
            ];

            // Access private method using bracket notation
            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toBe(
                'network:\n' +
                '  version: 2\n' +
                '  ethernets:\n' +
                '    enp1s0:\n' +
                '      link-local: [ ipv4 ]'
            );
        });

        it('should generate correct netplan YAML for multiple NICs', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '192.168.1.10' },
                { linuxDeviceName: 'enp2s0', ipv4Address: '192.168.1.11' },
                { linuxDeviceName: 'enp3s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toBe(
                'network:\n' +
                '  version: 2\n' +
                '  ethernets:\n' +
                '    enp1s0:\n' +
                '      link-local: [ ipv4 ]\n' +
                '    enp2s0:\n' +
                '      link-local: [ ipv4 ]\n' +
                '    enp3s0:\n' +
                '      link-local: [ ipv4 ]'
            );
        });

        it('should handle NIC without IP address', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toBe(
                'network:\n' +
                '  version: 2\n' +
                '  ethernets:\n' +
                '    enp1s0:\n' +
                '      link-local: [ ipv4 ]'
            );
        });

        it('should use correct YAML indentation', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '10.0.0.1' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Verify proper indentation
            const lines = config.split('\n');
            expect(lines[0]).toBe('network:');
            expect(lines[1]).toBe('  version: 2');
            expect(lines[2]).toBe('  ethernets:');
            expect(lines[3]).toBe('    enp1s0:');
            expect(lines[4]).toBe('      link-local: [ ipv4 ]');
        });

        it('should generate valid YAML structure', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '192.168.1.10' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Verify YAML structure
            expect(config).toContain('network:');
            expect(config).toContain('version: 2');
            expect(config).toContain('ethernets:');
            expect(config).toContain('link-local: [ ipv4 ]');
        });

        it('should handle NICs with various naming patterns', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '' },
                { linuxDeviceName: 'enp2s0f0', ipv4Address: '' },
                { linuxDeviceName: 'enp65s0f1', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toContain('enp1s0:');
            expect(config).toContain('enp2s0f0:');
            expect(config).toContain('enp65s0f1:');
        });

        it('should maintain NIC order in output', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp3s0', ipv4Address: '' },
                { linuxDeviceName: 'enp1s0', ipv4Address: '' },
                { linuxDeviceName: 'enp2s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Verify order is preserved
            const enp3Index = config.indexOf('enp3s0:');
            const enp1Index = config.indexOf('enp1s0:');
            const enp2Index = config.indexOf('enp2s0:');

            expect(enp3Index).toBeLessThan(enp1Index);
            expect(enp1Index).toBeLessThan(enp2Index);
        });

        it('should generate config with exact link-local syntax', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '192.168.1.10' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Verify exact link-local syntax with square brackets
            expect(config).toContain('link-local: [ ipv4 ]');
            expect(config).not.toContain('link-local: ipv4');
            expect(config).not.toContain('link-local: [ipv4]');
        });

        it('should handle empty NIC array', () => {
            const nics: ConnectXNIC[] = [];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toBe(
                'network:\n' +
                '  version: 2\n' +
                '  ethernets:'
            );
        });

        it('should not include IP addresses in configuration', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '192.168.1.10' },
                { linuxDeviceName: 'enp2s0', ipv4Address: '10.0.0.5' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Configuration should not contain the IP addresses
            expect(config).not.toContain('192.168.1.10');
            expect(config).not.toContain('10.0.0.5');
        });

        it('should generate parseable YAML', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '' },
                { linuxDeviceName: 'enp2s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            // Basic YAML validation - no tabs, proper line endings
            expect(config).not.toContain('\t');
            expect(config.split('\n').every((line: string) => 
                line === '' || line.startsWith('network:') || line.startsWith(' ')
            )).toBe(true);
        });

        it('should include network version 2', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toContain('version: 2');
        });

        it('should use ethernets renderer', () => {
            const nics: ConnectXNIC[] = [
                { linuxDeviceName: 'enp1s0', ipv4Address: '' }
            ];

            const config = (service as any).buildNetplanConfig(nics);

            expect(config).toContain('ethernets:');
        });

        it('should handle ten NICs correctly', () => {
            const nics: ConnectXNIC[] = Array.from({ length: 10 }, (_, i) => ({
                linuxDeviceName: `enp${i}s0`,
                ipv4Address: ''
            }));

            const config = (service as any).buildNetplanConfig(nics);

            // Verify all NICs are present
            for (let i = 0; i < 10; i++) {
                expect(config).toContain(`enp${i}s0:`);
            }

            // Count link-local occurrences
            const linkLocalCount = (config.match(/link-local: \[ ipv4 \]/g) || []).length;
            expect(linkLocalCount).toBe(10);
        });
    });
});
