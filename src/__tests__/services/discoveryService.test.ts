/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceDiscoveryService } from '../../services/deviceDiscoveryService';
import { DiscoveredDevice } from '../../types/devices';
import { ITelemetryService } from '../../types/telemetry';

// Mock the vscode module
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
        })),
    },
}));

// Mock dnssd with proper cleanup tracking
const mockBrowserInstances: any[] = [];

jest.mock('dnssd', () => {
    const mockBrowserConstructor = jest.fn((serviceType: string, options: object) => {
        const instance = {
            start: jest.fn(),
            stop: jest.fn(),
            on: jest.fn(),
            _eventHandlers: {} as any,
        };
        
        // Store event handlers
        instance.on.mockImplementation((event: string, handler: Function) => {
            instance._eventHandlers[event] = handler;
            return instance;
        });
        
        mockBrowserInstances.push(instance);
        return instance;
    });
    
    return {
        Browser: mockBrowserConstructor,
        tcp: jest.fn((service: string) => service),
    };
});

// Mock os module
jest.mock('os', () => ({
    networkInterfaces: jest.fn(() => ({
        'Ethernet': [{
            family: 'IPv4',
            address: '192.168.1.100',
            internal: false
        }]
    }))
}));

describe('DeviceDiscoveryService', () => {
    let discoveryService: DeviceDiscoveryService;
    let mockOutputChannel: any;
    let mockTelemetry: jest.Mocked<ITelemetryService>;

    beforeEach(() => {
        // Use fake timers to control setTimeout behavior
        jest.useFakeTimers();
        
        // Create mock telemetry
        mockTelemetry = {
            trackEvent: jest.fn(),
            trackError: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            setEnabled: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined),
        } as any;
        
        discoveryService = new DeviceDiscoveryService({ telemetry: mockTelemetry });
    });

    afterEach(() => {
        // Clear all mocks and timers
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useRealTimers();
        
        // Clean up all browser instances
        mockBrowserInstances.forEach((instance: any) => {
            if (instance.stop && !instance.stop.mock.calls.length) {
                instance.stop();
            }
        });
        mockBrowserInstances.length = 0;
    });

    describe('discoverDevices', () => {
        it('should handle discovery timeout gracefully', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);
            
            // Fast-forward time to trigger timeout
            jest.advanceTimersByTime(100);
            
            const devices = await discoveryPromise;
            
            expect(devices).toEqual([]);
            // Check that a browser instance was created and stopped
            expect(mockBrowserInstances.length).toBeGreaterThan(0);
            expect(mockBrowserInstances[0].stop).toHaveBeenCalled();
        });

        it('should handle browser creation failure', async () => {
            // Override the mock to throw an error for this test only
            const dnssd = require('dnssd');
            const originalImpl = dnssd.Browser.getMockImplementation();
            dnssd.Browser.mockImplementationOnce(() => {
                throw new Error('Browser initialization failed');
            });

            const discoveryPromise = discoveryService.discoverDevices(100);
            const devices = await discoveryPromise;
            expect(devices).toEqual([]);
            
            // Restore original implementation
            if (originalImpl) {
                dnssd.Browser.mockImplementation(originalImpl);
            }
        });

        it('should discover and return ZGX devices', async () => {
            const discoveryPromise = discoveryService.discoverDevices(500);

            // Get the most recent browser instance
            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            
            // Simulate a serviceUp event with a discovered ZGX device
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'SSH on zgx-abc123',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 22,
                    type: 'ssh',
                    protocol: 'tcp',
                    fullname: 'SSH on zgx-abc123._ssh._tcp.local'
                });
            }

            // Fast-forward time to trigger timeout
            jest.advanceTimersByTime(500);

            const devices = await discoveryPromise;
            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('zgx-abc123');
            expect(devices[0].addresses).toEqual(['192.168.1.100']);
            expect(devices[0].port).toBe(22);
        });

        it('should filter non-ZGX devices', async () => {
            const discoveryPromise = discoveryService.discoverDevices(500);

            // Get the most recent browser instance
            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            
            // Simulate serviceUp events for both ZGX and non-ZGX devices
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            if (serviceUpHandler) {
                // Non-ZGX device (should be filtered out)
                serviceUpHandler({
                    name: 'regular-server',
                    host: 'regular-server.local',
                    addresses: ['192.168.1.200'],
                    port: 22,
                    type: 'ssh',
                    protocol: 'tcp',
                    fullname: 'regular-server._ssh._tcp.local'
                });

                // ZGX device (should be kept)
                serviceUpHandler({
                    name: 'SSH on spark-ab12',
                    host: 'spark-ab12.local',
                    addresses: ['192.168.1.150'],
                    port: 22,
                    type: 'ssh',
                    protocol: 'tcp',
                    fullname: 'SSH on spark-ab12._ssh._tcp.local'
                });
            }

            // Fast-forward time to trigger timeout
            jest.advanceTimersByTime(500);

            const devices = await discoveryPromise;
            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('spark-ab12');
            expect(devices[0].addresses).toEqual(['192.168.1.150']);
        });
    });

});