/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for DeviceService.
 * Validates business logic for device CRUD operations.
 */

import { DeviceService } from '../../services/deviceService';
import { DeviceStore } from '../../store/deviceStore';
import { DeviceConfig, Device, DiscoveredDevice } from '../../types/devices';
import { ITelemetryService } from '../../types/telemetry';

// Mock telemetry service
const mockTelemetryService: ITelemetryService = {
  trackEvent: jest.fn(),
  trackError: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false),
  setEnabled: jest.fn(),
  dispose: jest.fn().mockResolvedValue(undefined),
};

describe('DeviceService', () => {
  let service: DeviceService;
  let store: DeviceStore;
  
  beforeEach(() => {
    store = new DeviceStore();
    service = new DeviceService({ store, telemetry: mockTelemetryService });
    jest.clearAllMocks();
  });

  describe('createDevice', () => {
    it('should create a device with valid configuration', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '192.168.1.100',
        username: 'zgx',
        port: 22,
        useKeyAuth: true,
      };

      const device = await service.createDevice(config);

      expect(device.id).toBeDefined();
      expect(device.name).toBe(config.name);
      expect(device.host).toBe(config.host);
      expect(device.username).toBe(config.username);
      expect(device.port).toBe(config.port);
      expect(device.isSetup).toBe(false);
      expect(device.createdAt).toBeDefined();
      expect(store.get(device.id)).toEqual(device);
    });

    it('should throw error if name is missing', async () => {
      const config: DeviceConfig = {
        name: '',
        host: '192.168.1.100',
        username: 'zgx',
        port: 22,
        useKeyAuth: true,
      };

      await expect(service.createDevice(config)).rejects.toThrow('invalid device name');
    });

    it('should throw error if host is missing', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '',
        username: 'zgx',
        port: 22,
        useKeyAuth: true,
      };

      await expect(service.createDevice(config)).rejects.toThrow('invalid device host');
    });

    it('should throw error if username is missing', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '192.168.1.100',
        username: '',
        port: 22,
        useKeyAuth: true,
      };

      await expect(service.createDevice(config)).rejects.toThrow('invalid username');
    });

    it('should throw error if port is invalid', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '192.168.1.100',
        username: 'zgx',
        port: 0,
        useKeyAuth: true,
      };

      await expect(service.createDevice(config)).rejects.toThrow('invalid port number (must be between 1 and 65535)');
    });

    it('should throw error if device name already exists', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '192.168.1.100',
        username: 'zgx',
        port: 22,
        useKeyAuth: true,
      };

      await service.createDevice(config);
      
      await expect(service.createDevice(config)).rejects.toThrow(
        'A device with the name "Test device" already exists'
      );
    });

    it('should generate unique IDs for each device', async () => {
      const config: DeviceConfig = {
        name: 'Test device',
        host: '192.168.1.100',
        username: 'zgx',
        port: 22,
        useKeyAuth: true,
      };

      const machine1 = await service.createDevice({ ...config, name: 'device 1' });
      const machine2 = await service.createDevice({ ...config, name: 'device 2' });

      expect(machine1.id).not.toBe(machine2.id);
    });
  });

  describe('updateDevice', () => {
    it('should update an existing device', async () => {
      const device = await createTestDevice(service);
      
      await service.updateDevice(device.id, {
        name: 'Updated Name',
      });

      const updated = store.get(device.id);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should throw error if device does not exist', async () => {
      await expect(
        service.updateDevice('non-existent', { name: 'Updated' })
      ).rejects.toThrow('device not found: non-existent');
    });

    it('should only update specified fields', async () => {
      const device = await createTestDevice(service);
      const originalHost = device.host;
      
      await service.updateDevice(device.id, { name: 'Updated Name' });

      const updated = store.get(device.id);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.host).toBe(originalHost); // Should not change
    });
  });

  describe('deleteDevice', () => {
    it('should delete an existing device', async () => {
      const device = await createTestDevice(service);
      
      await service.deleteDevice(device.id);

      expect(store.get(device.id)).toBeUndefined();
    });

    it('should throw error if device does not exist', async () => {
      await expect(service.deleteDevice('non-existent')).rejects.toThrow(
        'device not found: non-existent'
      );
    });
  });

  describe('getDevice', () => {
    it('should get a device by ID', async () => {
      const device = await createTestDevice(service);
      
      const retrieved = service.getDevice(device.id);

      expect(retrieved).toEqual(device);
    });

    it('should return undefined if device does not exist', () => {
      const retrieved = service.getDevice('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

});

/**
 * Helper function to create a test device via the service.
 */
async function createTestDevice(
  service: DeviceService,
  name: string = 'Test device'
): Promise<Device> {
  const config: DeviceConfig = {
    name,
    host: '192.168.1.100',
    username: 'zgx',
    port: 22,
    useKeyAuth: true,
  };

  return service.createDevice(config);
}
