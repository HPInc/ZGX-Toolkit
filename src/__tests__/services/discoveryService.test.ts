/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceDiscoveryService } from '../../services/deviceDiscoveryService';
import { DiscoveredDevice } from '../../types/devices';
import { ITelemetryService } from '../../types/telemetry';
import { NET_PROTOCOLS, NET_DNSSD_SERVICES } from '../../constants/net';

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
            _serviceType: serviceType,
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
        udp: jest.fn((service: string) => service),
    };
});

// Mock os module
jest.mock('os', () => {
    const mockNetworkInterfaces = jest.fn<ReturnType<typeof import('os').networkInterfaces>, []>(() => ({
        'Ethernet': [{
            family: 'IPv4',
            address: '192.168.1.100',
            internal: false,
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.100/24'
        }]
    }));
    
    return {
        networkInterfaces: mockNetworkInterfaces
    };
});

const os = require('os');
const mockNetworkInterfaces = os.networkInterfaces;

describe('DeviceDiscoveryService', () => {
    let discoveryService: DeviceDiscoveryService;
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

    describe('discoverService', () => {
        it('should discover devices using TCP protocol', async () => {
            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            // Get the browser instance
            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            
            // Simulate serviceUp event
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'SSH Server',
                    host: 'test-device.local',
                    addresses: ['192.168.1.50', '::1'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('test-device');
            expect(devices[0].addresses).toEqual(['192.168.1.50']); // Only IPv4
            expect(devices[0].port).toBe(22);
            expect(devices[0].protocol).toBe('tcp');
        });

        it('should discover devices using UDP protocol', async () => {
            const discoveryPromise = discoveryService.discoverService(
                '_custom',
                NET_PROTOCOLS.UDP,
                100
            );

            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Custom Service',
                    host: 'udp-device.local',
                    addresses: ['192.168.1.60'],
                    port: 5353
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].protocol).toBe('udp');
        });

        it('should filter out IPv6 addresses', async () => {
            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Mixed Addresses',
                    host: 'mixed-device.local',
                    addresses: ['fe80::1', '192.168.1.70', '2001:db8::1'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices[0].addresses).toEqual(['192.168.1.70']);
        });

        it('should handle multiple devices with same hostname (overwrite)', async () => {
            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            const mockBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = mockBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                // First discovery
                serviceUpHandler({
                    name: 'Device 1',
                    host: 'duplicate.local',
                    addresses: ['192.168.1.80'],
                    port: 22
                });
                
                // Second discovery with same hostname
                serviceUpHandler({
                    name: 'Device 2',
                    host: 'duplicate.local',
                    addresses: ['192.168.1.81'],
                    port: 2222
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            // Should only have one device (the latest)
            expect(devices).toHaveLength(1);
            expect(devices[0].name).toBe('Device 2');
            expect(devices[0].port).toBe(2222);
        });

        it('should return empty array when no interfaces available', async () => {
            // Mock no network interfaces
            mockNetworkInterfaces.mockReturnValueOnce({} as any);

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            const devices = await discoveryPromise;

            expect(devices).toEqual([]);
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'discover',
                    properties: expect.objectContaining({
                        result: 'no-interfaces'
                    })
                })
            );
        });

        it('should handle browser creation failure gracefully', async () => {
            const dnssd = require('dnssd');
            const originalImpl = dnssd.Browser.getMockImplementation();
            
            dnssd.Browser.mockImplementationOnce(() => {
                throw new Error('Browser creation failed');
            });

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            const devices = await discoveryPromise;

            // Should return empty array but not track error (per-interface errors are just logged)
            expect(devices).toEqual([]);
            
            if (originalImpl) {
                dnssd.Browser.mockImplementation(originalImpl);
            }
        });

        it('should create browsers on multiple network interfaces', async () => {
            mockNetworkInterfaces.mockReturnValueOnce({
                'Ethernet': [{
                    family: 'IPv4',
                    address: '192.168.1.100',
                    internal: false,
                    netmask: '255.255.255.0',
                    mac: '00:00:00:00:00:00',
                    cidr: '192.168.1.100/24'
                }],
                'WiFi': [{
                    family: 'IPv4',
                    address: '192.168.2.100',
                    internal: false,
                    netmask: '255.255.255.0',
                    mac: '00:00:00:00:00:01',
                    cidr: '192.168.2.100/24'
                }]
            });

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Should create 2 browsers (one per interface)
            expect(mockBrowserInstances.length).toBe(2);
        });

        it('should skip internal (loopback) interfaces', async () => {
            mockNetworkInterfaces.mockReturnValueOnce({
                'lo': [{
                    family: 'IPv4',
                    address: '127.0.0.1',
                    internal: true,
                    netmask: '255.0.0.0',
                    mac: '00:00:00:00:00:00',
                    cidr: '127.0.0.1/8'
                }],
                'Ethernet': [{
                    family: 'IPv4',
                    address: '192.168.1.100',
                    internal: false,
                    netmask: '255.255.255.0',
                    mac: '00:00:00:00:00:01',
                    cidr: '192.168.1.100/24'
                }]
            });

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Should only create 1 browser (skipping loopback)
            expect(mockBrowserInstances.length).toBe(1);
        });

        it('should handle undefined network interface entries', async () => {
            mockNetworkInterfaces.mockReturnValueOnce({
                'InvalidInterface': undefined as any,
                'Ethernet': [{
                    family: 'IPv4',
                    address: '192.168.1.100',
                    internal: false,
                    netmask: '255.255.255.0',
                    mac: '00:00:00:00:00:00',
                    cidr: '192.168.1.100/24'
                }]
            });

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Should only create browser for valid interface
            expect(mockBrowserInstances.length).toBe(1);
        });

        it('should skip IPv6 interfaces', async () => {
            mockNetworkInterfaces.mockReturnValueOnce({
                'Ethernet': [
                    {
                        family: 'IPv6',
                        address: 'fe80::1',
                        internal: false,
                        netmask: 'ffff:ffff:ffff:ffff::',
                        mac: '00:00:00:00:00:00',
                        cidr: 'fe80::1/64',
                        scopeid: 1
                    },
                    {
                        family: 'IPv4',
                        address: '192.168.1.100',
                        internal: false,
                        netmask: '255.255.255.0',
                        mac: '00:00:00:00:00:00',
                        cidr: '192.168.1.100/24'
                    }
                ]
            });

            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Should only create 1 browser for the IPv4 address
            expect(mockBrowserInstances.length).toBe(1);
        });

        it('should stop all browsers after timeout', async () => {
            const discoveryPromise = discoveryService.discoverService(
                NET_DNSSD_SERVICES.SSH,
                NET_PROTOCOLS.TCP,
                100
            );

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            mockBrowserInstances.forEach(browser => {
                expect(browser.stop).toHaveBeenCalled();
            });
        });
    });

    describe('discoverDevices', () => {
        it('should run both SSH and HPZGX discovery in parallel', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);
            
            // Should create 2 browsers (one for SSH, one for HPZGX)
            expect(mockBrowserInstances.length).toBe(2);
            
            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Both browsers should be started
            mockBrowserInstances.forEach(browser => {
                expect(browser.start).toHaveBeenCalled();
            });
        });

        it('should discover ZGX devices from SSH service', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            // Simulate SSH service discovery
            const sshBrowser = mockBrowserInstances[0];
            const serviceUpHandler = sshBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'SSH on zgx-abc123',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('zgx-abc123');
        });

        it('should discover ZGX devices from HPZGX service', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            // Simulate HPZGX service discovery
            const hpzgxBrowser = mockBrowserInstances[1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'ZGX Device',
                    host: 'zgx-xyz789.local',
                    addresses: ['192.168.1.110'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('zgx-xyz789');
        });

        it('should filter non-ZGX devices from SSH service', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            const sshBrowser = mockBrowserInstances[0];
            const serviceUpHandler = sshBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                // Non-ZGX device (should be filtered)
                serviceUpHandler({
                    name: 'regular-server',
                    host: 'regular-server.local',
                    addresses: ['192.168.1.200'],
                    port: 22
                });
                
                // ZGX device (should be kept)
                serviceUpHandler({
                    name: 'spark-ab12',
                    host: 'spark-ab12.local',
                    addresses: ['192.168.1.150'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('spark-ab12');
        });

        it('should prioritize HPZGX service over SSH when same device found', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            // Discover via SSH first
            const sshBrowser = mockBrowserInstances[0];
            const sshHandler = sshBrowser._eventHandlers['serviceUp'];
            if (sshHandler) {
                sshHandler({
                    name: 'SSH Service',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 22
                });
            }

            // Discover via HPZGX (same device)
            const hpzgxBrowser = mockBrowserInstances[1];
            const hpzgxHandler = hpzgxBrowser._eventHandlers['serviceUp'];
            if (hpzgxHandler) {
                hpzgxHandler({
                    name: 'HPZGX Service',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            // Should only have one device with HPZGX data
            expect(devices).toHaveLength(1);
            expect(devices[0].name).toBe('HPZGX Service');
            expect(devices[0].port).toBe(5000);
        });

        it('should handle SSH discovery failure and still return HPZGX results', async () => {
            const dnssd = require('dnssd');
            const originalImpl = dnssd.Browser.getMockImplementation();
            
            // Make first browser (SSH) fail
            dnssd.Browser.mockImplementationOnce(() => {
                throw new Error('SSH browser failed');
            });
            
            // Second browser (HPZGX) succeeds
            dnssd.Browser.mockImplementationOnce((serviceType: string, options: object) => {
                const instance = {
                    start: jest.fn(),
                    stop: jest.fn(),
                    on: jest.fn(),
                    _eventHandlers: {} as any,
                };
                instance.on.mockImplementation((event: string, handler: Function) => {
                    instance._eventHandlers[event] = handler;
                    return instance;
                });
                mockBrowserInstances.push(instance);
                return instance;
            });

            const discoveryPromise = discoveryService.discoverDevices(100);

            // Only HPZGX browser should exist
            const hpzgxBrowser = mockBrowserInstances[0];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'ZGX via HPZGX',
                    host: 'zgx-def456.local',
                    addresses: ['192.168.1.120'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('zgx-def456');
            
            if (originalImpl) {
                dnssd.Browser.mockImplementation(originalImpl);
            }
        });

        it('should track telemetry for successful discovery', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            const sshBrowser = mockBrowserInstances[0];
            const serviceUpHandler = sshBrowser._eventHandlers['serviceUp'];
            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'ZGX Device',
                    host: 'zgx-test01.local',
                    addresses: ['192.168.1.130'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'discover',
                    properties: expect.objectContaining({
                        method: 'dns-sd',
                        result: 'success'
                    }),
                    measurements: expect.objectContaining({
                        deviceCount: 1
                    })
                })
            );
        });

        it('should support all ZGX hostname patterns', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            const sshBrowser = mockBrowserInstances[0];
            const serviceUpHandler = sshBrowser._eventHandlers['serviceUp'];
            
            if (serviceUpHandler) {
                // 6-character pattern
                serviceUpHandler({
                    name: 'Device 1',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.1'],
                    port: 22
                });
                
                // 4-character pattern
                serviceUpHandler({
                    name: 'Device 2',
                    host: 'zgx-ab12.local',
                    addresses: ['192.168.1.2'],
                    port: 22
                });
                
                // NVIDIA spark pattern
                serviceUpHandler({
                    name: 'Device 3',
                    host: 'spark-xy34.local',
                    addresses: ['192.168.1.3'],
                    port: 22
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(3);
            expect(devices.map(d => d.hostname)).toContain('zgx-abc123');
            expect(devices.map(d => d.hostname)).toContain('zgx-ab12');
            expect(devices.map(d => d.hostname)).toContain('spark-xy34');
        });

        it('should return empty array when no devices discovered', async () => {
            const discoveryPromise = discoveryService.discoverDevices(100);

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toEqual([]);
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    measurements: expect.objectContaining({
                        deviceCount: 0
                    })
                })
            );
        });
    });

    describe('rediscoverDevices', () => {
        it('should return empty array when dnssdInstances is empty', async () => {
            const devices = await discoveryService.rediscoverDevices([]);

            expect(devices).toEqual([]);
            // Should not create any browsers
            expect(mockBrowserInstances.length).toBe(0);
        });

        it('should discover devices matching the provided instance names', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['ZGX Device 1', 'ZGX Device 2'], 100);

            // Get the browser instance created for HPZGX discovery
            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                // Device that matches
                serviceUpHandler({
                    name: 'ZGX Device 1',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });

                // Device that doesn't match
                serviceUpHandler({
                    name: 'ZGX Device 3',
                    host: 'zgx-xyz789.local',
                    addresses: ['192.168.1.110'],
                    port: 5000
                });

                // Another device that matches
                serviceUpHandler({
                    name: 'ZGX Device 2',
                    host: 'zgx-def456.local',
                    addresses: ['192.168.1.120'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(2);
            expect(devices.map(d => d.name)).toContain('ZGX Device 1');
            expect(devices.map(d => d.name)).toContain('ZGX Device 2');
            expect(devices.map(d => d.name)).not.toContain('ZGX Device 3');
        });

        it('should only use HPZGX service for rediscovery', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['Test Device'], 100);

            jest.advanceTimersByTime(100);
            await discoveryPromise;

            // Should only create one browser (for HPZGX service)
            expect(mockBrowserInstances.length).toBe(1);
        });

        it('should handle devices without name property', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['ZGX Device'], 100);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                // Device with name
                serviceUpHandler({
                    name: 'ZGX Device',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });

                // Device without name (should be skipped)
                serviceUpHandler({
                    name: undefined,
                    host: 'zgx-xyz789.local',
                    addresses: ['192.168.1.110'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].name).toBe('ZGX Device');
        });

        it('should filter by exact instance name match', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['ZGX-123'], 100);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                // Exact match
                serviceUpHandler({
                    name: 'ZGX-123',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });

                // Partial match (should not be included)
                serviceUpHandler({
                    name: 'ZGX-1234',
                    host: 'zgx-def456.local',
                    addresses: ['192.168.1.110'],
                    port: 5000
                });

                // Contains but not exact (should not be included)
                serviceUpHandler({
                    name: 'My ZGX-123 Device',
                    host: 'zgx-xyz789.local',
                    addresses: ['192.168.1.120'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].name).toBe('ZGX-123');
        });

        it('should return devices with updated network information', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['Updated Device'], 100);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Updated Device',
                    host: 'zgx-new123.local',
                    addresses: ['192.168.2.50', '10.0.0.50'],
                    port: 5555
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(devices[0].hostname).toBe('zgx-new123');
            expect(devices[0].addresses).toEqual(['192.168.2.50', '10.0.0.50']);
            expect(devices[0].port).toBe(5555);
            expect(devices[0].protocol).toBe('tcp');
        });

        it('should handle multiple instance names', async () => {
            const instanceNames = ['Device-A', 'Device-B', 'Device-C'];
            const discoveryPromise = discoveryService.rediscoverDevices(instanceNames, 100);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Device-A',
                    host: 'zgx-aaa111.local',
                    addresses: ['192.168.1.1'],
                    port: 5000
                });

                serviceUpHandler({
                    name: 'Device-B',
                    host: 'zgx-bbb222.local',
                    addresses: ['192.168.1.2'],
                    port: 5000
                });

                serviceUpHandler({
                    name: 'Device-C',
                    host: 'zgx-ccc333.local',
                    addresses: ['192.168.1.3'],
                    port: 5000
                });

                // Device not in list
                serviceUpHandler({
                    name: 'Device-D',
                    host: 'zgx-ddd444.local',
                    addresses: ['192.168.1.4'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(3);
            expect(devices.map(d => d.name)).toEqual(['Device-A', 'Device-B', 'Device-C']);
        });

        it('should return empty array when no matching devices found', async () => {
            const discoveryPromise = discoveryService.rediscoverDevices(['NonExistent'], 100);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Different Device',
                    host: 'zgx-abc123.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });
            }

            jest.advanceTimersByTime(100);
            const devices = await discoveryPromise;

            expect(devices).toEqual([]);
        });

        it('should respect custom timeout', async () => {
            const customTimeout = 500;
            const discoveryPromise = discoveryService.rediscoverDevices(['Test'], customTimeout);

            const hpzgxBrowser = mockBrowserInstances[mockBrowserInstances.length - 1];
            const serviceUpHandler = hpzgxBrowser._eventHandlers['serviceUp'];

            if (serviceUpHandler) {
                serviceUpHandler({
                    name: 'Test',
                    host: 'zgx-test.local',
                    addresses: ['192.168.1.100'],
                    port: 5000
                });
            }

            // Advance by custom timeout
            jest.advanceTimersByTime(customTimeout);
            const devices = await discoveryPromise;

            expect(devices).toHaveLength(1);
            expect(hpzgxBrowser.stop).toHaveBeenCalled();
        });
    });

});