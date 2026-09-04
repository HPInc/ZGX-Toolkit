/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppSelectionViewController } from '../../views/apps/selection/appSelectionViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device, DeviceType } from '../../types/devices';
import { jest } from '@jest/globals';

// Mock device health check service
jest.mock('../../services', () => ({
    deviceHealthCheckService: {
        checkDeviceHealth: jest.fn()
    }
}));

// Mock logger
const mockLogger: Logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    setLevel: jest.fn(),
    getLevel: jest.fn(),
    show: jest.fn()
} as any;

// Mock telemetry
const mockTelemetry: ITelemetryService = {
    trackEvent: jest.fn(),
    trackError: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(false),
    setEnabled: jest.fn(),
    dispose: jest.fn() as any
} as any;

// Mock device
const mockDevice: Device = {
    id: 'test-device-1',
    name: 'Test device',
    host: '192.168.1.100',
    username: 'testuser',
    port: 22,
    isSetup: true,
    useKeyAuth: true,
    keySetup: {
        keyGenerated: true,
        keyCopied: true,
        connectionTested: true
    },
    createdAt: new Date().toISOString()
};

// Mock app categories
jest.mock('../../constants/apps', () => ({
    APP_CATEGORIES: [
        {
            id: 'model-serving',
            name: 'Model Serving',
            description: 'Model serving and management tools for supported devices',
            deviceType: 'zgx_fury',
            apps: [
                {
                    id: 'zrt',
                    name: 'HP Z Runtime',
                    icon: '⚡',
                    description: 'Command-line wrapper around vLLM for serving large language models',
                    features: ['Pull and run models from popular model hubs', 'Serve models with a single command', 'Streamlined model lifecycle management', 'OpenAI-compatible API endpoints for LLM inference'],
                    category: 'model-serving',
                    dependencies: ['snapd']
                }
            ]
        },
        {
            id: 'system-stack',
            name: 'System Stack',
            description: 'Essential system libraries and tools',
            apps: [
                {
                    id: 'base-system',
                    name: 'Base System',
                    icon: '🔧',
                    description: 'Python development environment',
                    features: ['Python 3.12', 'Build tools', 'System libraries'],
                    category: 'system-stack',
                    dependencies: []
                },
                {
                    id: 'podman',
                    name: 'Podman',
                    icon: '🦭',
                    description: 'Container engine',
                    features: ['Docker-compatible', 'Rootless', 'Kubernetes support'],
                    category: 'system-stack',
                    dependencies: ['base-system']
                },
                {
                    id: 'ollama',
                    name: 'Ollama',
                    icon: '🦙',
                    description: 'LLM runtime',
                    features: ['Local LLMs'],
                    category: 'system-stack',
                    dependencies: ['base-system']
                },
                {
                    id: 'snapd',
                    name: 'snapd',
                    icon: '🧩',
                    description: 'Snap package management service for Linux',
                    features: ['Install snap packages from the Snap Store'],
                    category: 'system-stack'
                }
            ]
        }
    ],
    getAllApps: jest.fn(() => [
        {
            id: 'zrt',
            name: 'HP Z Runtime',
            icon: '⚡',
            description: 'Pull, serve, and manage AI models locally with a streamlined runtime designed for HP ZGX systems',
            features: ['Pull and run models from popular model hubs'],
            category: 'model-serving',
            dependencies: ['snapd']
        },
        {
            id: 'base-system',
            name: 'Base System',
            icon: '🔧',
            description: 'Python development environment',
            features: ['Python 3.12', 'Build tools', 'System libraries'],
            category: 'system-stack',
            dependencies: []
        },
        {
            id: 'podman',
            name: 'Podman',
            icon: '🦭',
            description: 'Container engine',
            features: ['Docker-compatible', 'Rootless', 'Kubernetes support'],
            category: 'system-stack',
            dependencies: ['base-system']
        },
        {
            id: 'ollama',
            name: 'Ollama',
            icon: '🦙',
            description: 'LLM runtime',
            features: ['Local LLMs'],
            category: 'system-stack',
            dependencies: ['base-system']
        },
        {
            id: 'snapd',
            name: 'snapd',
            icon: '🧩',
            description: 'Snap package management service for Linux',
            features: ['Install snap packages from the Snap Store'],
            category: 'system-stack'
        }
    ]),
    getAppById: jest.fn((id: string) => {
        const apps = [
            {
                id: 'zrt',
                name: 'HP Z Runtime',
                icon: '⚡',
                description: 'Pull, serve, and manage AI models locally with a streamlined runtime designed for HP ZGX systems',
                features: ['Pull and run models from popular model hubs'],
                category: 'model-serving',
                dependencies: ['snapd']
            },
            {
                id: 'base-system',
                name: 'Base System',
                icon: '🔧',
                description: 'Python development environment',
                features: ['Python 3.12', 'Build tools', 'System libraries'],
                category: 'system-stack',
                dependencies: []
            },
            {
                id: 'podman',
                name: 'Podman',
                icon: '🦭',
                description: 'Container engine',
                features: ['Docker-compatible', 'Rootless', 'Kubernetes support'],
                category: 'system-stack',
                dependencies: ['base-system']
            },
            {
                id: 'ollama',
                name: 'Ollama',
                icon: '🦙',
                description: 'LLM runtime',
                features: ['Local LLMs'],
                category: 'system-stack',
                dependencies: ['base-system']
            },
            {
                id: 'snapd',
                name: 'snapd',
                icon: '🧩',
                description: 'Snap package management service for Linux',
                features: ['Install snap packages from the Snap Store'],
                category: 'system-stack'
            }
        ];
        return apps.find(app => app.id === id);
    })
}));

describe('AppSelectionView', () => {
    let view: AppSelectionViewController;

    beforeEach(() => {
        // Reset and setup device health check service mock
        const { deviceHealthCheckService } = require('../../services');
        (deviceHealthCheckService.checkDeviceHealth as any).mockResolvedValue({
            isHealthy: true,
            device: 'Test device'
        });

        // Mock device service
        const mockDeviceService = {
            getDevice: jest.fn().mockReturnValue(mockDevice),
            getAllDevices: jest.fn().mockReturnValue([mockDevice]),
            addDevice: jest.fn(),
            updateDevice: jest.fn(),
            deleteDevice: jest.fn()
        } as any;

        const mockAppInstallationService = {
            verifyAppInstallation: jest.fn()
        } as any;

        view = new AppSelectionViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService,
            appInstallationService: mockAppInstallationService
        });

        // Setup message callback for testing
        view.setMessageCallback(jest.fn());
    });

    it('should render app selection view', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toBeTruthy();
        expect(html).toContain('Application Install');
        expect(html).toContain(mockDevice.name);
        // Should include error overlay template
        expect(html).toContain('error-overlay-template');
        // Should include initialization script
        expect(html).toContain('window.initAppSelection');
    });

    it('should display app categories', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toContain('System Stack');
        expect(html).toContain('Essential system libraries and tools');
    });

    it('should display apps in grid', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toContain('Base System');
        expect(html).toContain('🔧');
        expect(html).toContain('Python development environment');
        expect(html).toContain('Podman');
        expect(html).toContain('🦭');
        expect(html).toContain('Container engine');
    });

    it('should display the snapd card in the System Stack category', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toContain('snapd');
        expect(html).toContain('🧩');
        expect(html).toContain('Snap package management service for Linux');
    });

    describe('Model Serving category (device-type awareness)', () => {
        it('should feature Model Serving at the top and enabled for ZGX Fury devices', async () => {
            const furyDevice: Device = {
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.ZGXFury }
            };

            const html = await view.render({ device: furyDevice });

            expect(html).toContain('Model Serving');
            expect(html).toContain('HP Z Runtime');
            expect(html.indexOf('Model Serving')).toBeLessThan(html.indexOf('System Stack'));
            expect(html).not.toContain('category category-disabled');
            expect(html).not.toContain('data-disabled="true"');
        });

        it('should feature Model Serving at the top and enabled for ZGX Nano devices', async () => {
            const nanoDevice: Device = {
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.ZGXNano }
            };

            const html = await view.render({ device: nanoDevice });

            expect(html.indexOf('Model Serving')).toBeLessThan(html.indexOf('System Stack'));
            expect(html).not.toContain('category category-disabled');
        });

        it('should place Model Serving at the bottom and disabled for x86 (Z8) devices', async () => {
            const z8Device: Device = {
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.Z8 }
            };

            const html = await view.render({ device: z8Device });

            expect(html).toContain('Model Serving');
            expect(html).toContain('HP Z Runtime');
            expect(html.indexOf('System Stack')).toBeLessThan(html.indexOf('Model Serving'));
            expect(html).toContain('category category-disabled');
            expect(html).toContain('data-disabled="true"');
            expect(html).toContain('Unsupported on current device');
            expect(html).toContain('ZRT is currently only supported on HP ZGX Fury and Nano devices.');
            expect(html).not.toContain('class="disabled-badge"');
        });

        it('should place Model Serving at the bottom and disabled when device type is undefined', async () => {
            const html = await view.render({ device: mockDevice });

            expect(html.indexOf('System Stack')).toBeLessThan(html.indexOf('Model Serving'));
            expect(html).toContain('category category-disabled');
        });

        it('should place Model Serving at the bottom and disabled for Unknown/Pending device types', async () => {
            const unknownDevice: Device = {
                ...mockDevice,
                fingerprint: { deviceType: DeviceType.Unknown }
            };

            const html = await view.render({ device: unknownDevice });

            expect(html.indexOf('System Stack')).toBeLessThan(html.indexOf('Model Serving'));
            expect(html).toContain('category category-disabled');
        });
    });

    it('should mark selected apps', async () => {
        const deviceWithSelection = {
            ...mockDevice,
            selectedApps: ['base-system', 'podman'] as any
        };

        const html = await view.render({
            device: deviceWithSelection
        });

        expect(html).toContain('app-selected');
    });

    it('should include action buttons', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toContain('Install');
        expect(html).toContain('Continue to Inference');
        expect(html).toContain('Close');
        expect(html).toContain('Uninstall All');
    });

    it('should include selection info', async () => {
        const html = await view.render({
            device: mockDevice
        });

        expect(html).toContain('Base System is always required');
        expect(html).toContain('Dependencies will be automatically selected');
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render({} as any)).rejects.toThrow('device required');
    });

    it('should include a nonce attribute on the init script when a nonce is provided', async () => {
        const html = await view.render({ device: mockDevice }, 'test-nonce-123');

        expect(html).toContain('nonce="test-nonce-123"');
    });

    describe('device health check', () => {
        it('should perform health check when verify-installations is called', async () => {
            const { deviceHealthCheckService } = require('../../services');
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            await view.render({ device: mockDevice });
            
            // Simulate verify-installations message
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama', 'base-system']
            });
            
            expect(deviceHealthCheckService.checkDeviceHealth).toHaveBeenCalledWith(mockDevice);
        });

        it('should cache health check result during verification', async () => {
            const { deviceHealthCheckService } = require('../../services');
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            await view.render({ device: mockDevice });
            
            // Clear mock calls from any previous operations
            deviceHealthCheckService.checkDeviceHealth.mockClear();
            
            // Simulate verify-installations message
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama', 'base-system']
            });
            
            // Health check should be called once during verification
            expect(deviceHealthCheckService.checkDeviceHealth).toHaveBeenCalledTimes(1);
        });

        it('should clear health check cache on render', async () => {
            const { deviceHealthCheckService } = require('../../services');
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            // First render
            await view.render({ device: mockDevice });
            
            // Simulate verify-installations to cache health check
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama']
            });
            
            deviceHealthCheckService.checkDeviceHealth.mockClear();
            
            // Second render should clear cache
            await view.render({ device: mockDevice });
            
            // Verify installations again - should perform new health check
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama']
            });
            
            // Health check should be called again since cache was cleared
            expect(deviceHealthCheckService.checkDeviceHealth).toHaveBeenCalledTimes(1);
        });

        it('should send verification-cancelled when health check fails', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: false,
                device: 'Test device',
                error: 'Connection timeout'
            });
            
            await view.render({ device: mockDevice });
            
            // Simulate verify-installations message
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama', 'base-system']
            });
            
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'verification-cancelled'
                })
            );
        });

        it('should show error overlay when health check fails during verification', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: false,
                device: 'Test device',
                error: 'Connection timeout'
            });
            
            await view.render({ device: mockDevice });
            
            // Simulate verify-installations message
            await view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama', 'base-system']
            });
            
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Application installation status cannot be verified at this time',
                    error: 'Connection timeout'
                })
            );
        });

        it('should handle health check exceptions during verification', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);
            
            deviceHealthCheckService.checkDeviceHealth.mockRejectedValue(
                new Error('Unexpected error')
            );
            
            await view.render({ device: mockDevice });
            
            // Simulate verify-installations message and expect it to throw
            await expect(view.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['ollama', 'base-system']
            })).rejects.toThrow('Unexpected error');
        });
    });

    describe('message handling', () => {
        it('should handle close-error-overlay message without sending response', async () => {
            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);
            
            await view.handleMessage({ type: 'close-error-overlay' } as any);
            
            expect(mockMessageCallback).not.toHaveBeenCalled();
        });

        it('should handle verify-installations message with batched processing', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue({ isInstalled: true });
            
            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });
            
            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);
            
            // Test with 3 apps (all mocked apps) to ensure batching works
            // Batch size is 3, so all will be in one batch
            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['base-system', 'podman', 'ollama']
            } as any);
            
            // Should verify all 3 apps
            expect(mockAppInstallationService.verifyAppInstallation).toHaveBeenCalledTimes(3);
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'verification-complete'
                })
            );
        });

        it('should handle check-ollama message with health check', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue({ isInstalled: true });
            
            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });
            
            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);
            
            await testView.render({ device: mockDevice });
            
            await testView.handleMessage({
                type: 'check-ollama',
                deviceId: mockDevice.id
            } as any);
            
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'ollama-status',
                    deviceId: mockDevice.id,
                    isInstalled: true
                })
            );
        });

        it('should use cached health check for check-ollama after verification', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue({ isInstalled: true });
            
            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });
            
            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);
            
            await testView.render({ device: mockDevice });
            
            // First do verification (caches health check)
            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['base-system']
            } as any);
            
            deviceHealthCheckService.checkDeviceHealth.mockClear();
            
            // Then check ollama (should use cached result)
            await testView.handleMessage({
                type: 'check-ollama',
                deviceId: mockDevice.id
            } as any);
            
            // Health check should not be called again (using cache)
            expect(deviceHealthCheckService.checkDeviceHealth).not.toHaveBeenCalled();
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'ollama-status',
                    deviceId: mockDevice.id,
                    isInstalled: true
                })
            );
        });

        it('should skip ollama check when device health check fails', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: false,
                device: 'Test device',
                error: 'Connection timeout'
            });
            
            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });
            
            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);
            
            await testView.render({ device: mockDevice });
            
            await testView.handleMessage({
                type: 'check-ollama',
                deviceId: mockDevice.id
            } as any);
            
            // Should not attempt to verify app installation
            expect(mockAppInstallationService.verifyAppInstallation).not.toHaveBeenCalled();
            
            // Should send false status
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'ollama-status',
                    deviceId: mockDevice.id,
                    isInstalled: false
                })
            );
        });

        it('should handle uninstall-all message', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            
            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });
            
            const mockNavigationCallback = jest.fn() as any;
            testView.setNavigationCallback(mockNavigationCallback);
            
            await testView.handleMessage({
                type: 'uninstall-all',
                deviceId: mockDevice.id
            } as any);
            
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                'apps/progress',
                expect.objectContaining({
                    device: mockDevice,
                    operation: 'uninstall',
                    selectedApps: 'all'
                }),
                undefined
            );
        });

        it('should handle cancel message', async () => {
            const mockNavigationCallback = jest.fn() as any;
            view.setNavigationCallback(mockNavigationCallback);
            
            await view.handleMessage({ type: 'cancel' } as any);
            
            expect(mockNavigationCallback).toHaveBeenCalledWith(
                'devices/manager',
                undefined,
                undefined
            );
        });

        it('should ignore unknown message types (default case)', async () => {
            const mockNavigationCallback = jest.fn() as any;
            const mockMessageCallback = jest.fn();
            view.setNavigationCallback(mockNavigationCallback);
            view.setMessageCallback(mockMessageCallback);

            await view.handleMessage({ type: 'some-unhandled-type' } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
            expect(mockMessageCallback).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Unhandled message type in app selection',
                expect.objectContaining({ type: 'some-unhandled-type' })
            );
        });
    });

    describe('install-apps / uninstall-apps message handling', () => {
        it('should navigate to progress view on install-apps when device found', async () => {
            const mockNavigationCallback = jest.fn() as any;
            view.setNavigationCallback(mockNavigationCallback);

            await view.handleMessage({
                type: 'install-apps',
                deviceId: mockDevice.id,
                selectedApps: ['base-system', 'podman']
            } as any);

            expect(mockNavigationCallback).toHaveBeenCalledWith(
                'apps/progress',
                expect.objectContaining({
                    device: mockDevice,
                    operation: 'install',
                    selectedApps: ['base-system', 'podman']
                }),
                undefined
            );
        });

        it('should not navigate on install-apps when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            const mockNavigationCallback = jest.fn() as any;
            testView.setNavigationCallback(mockNavigationCallback);

            await testView.handleMessage({
                type: 'install-apps',
                deviceId: 'missing-device',
                selectedApps: ['base-system']
            } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for app install',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });

        it('should navigate to progress view on uninstall-apps when device found', async () => {
            const mockNavigationCallback = jest.fn() as any;
            view.setNavigationCallback(mockNavigationCallback);

            await view.handleMessage({
                type: 'uninstall-apps',
                deviceId: mockDevice.id,
                selectedApps: ['ollama']
            } as any);

            expect(mockNavigationCallback).toHaveBeenCalledWith(
                'apps/progress',
                expect.objectContaining({
                    device: mockDevice,
                    operation: 'uninstall',
                    selectedApps: ['ollama']
                }),
                undefined
            );
        });

        it('should not navigate on uninstall-apps when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            const mockNavigationCallback = jest.fn() as any;
            testView.setNavigationCallback(mockNavigationCallback);

            await testView.handleMessage({
                type: 'uninstall-apps',
                deviceId: 'missing-device',
                selectedApps: ['ollama']
            } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for app uninstall',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });
    });

    describe('continue-to-inference message handling', () => {
        it('should navigate to inference instructions when device found', async () => {
            const mockNavigationCallback = jest.fn() as any;
            view.setNavigationCallback(mockNavigationCallback);

            await view.handleMessage({
                type: 'continue-to-inference',
                deviceId: mockDevice.id
            } as any);

            expect(mockNavigationCallback).toHaveBeenCalledWith(
                'instructions/inference',
                expect.objectContaining({ device: mockDevice }),
                undefined
            );
        });

        it('should not navigate when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            const mockNavigationCallback = jest.fn() as any;
            testView.setNavigationCallback(mockNavigationCallback);

            await testView.handleMessage({
                type: 'continue-to-inference',
                deviceId: 'missing-device'
            } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for continue to inference',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });
    });

    describe('check-ollama edge cases', () => {
        it('should log and return when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            await testView.handleMessage({
                type: 'check-ollama',
                deviceId: 'missing-device'
            } as any);

            expect(mockMessageCallback).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Device not found for ollama check',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });

        it('should log and return when ollama app definition is missing', async () => {
            const { deviceHealthCheckService } = require('../../services');
            const { getAppById } = require('../../constants/apps');
            (getAppById as jest.Mock).mockReturnValueOnce(undefined);

            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });

            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            await testView.handleMessage({
                type: 'check-ollama',
                deviceId: mockDevice.id
            } as any);

            expect(mockAppInstallationService.verifyAppInstallation).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith('ollama app definition not found');
            // No ollama-status message should have been sent since we returned early
            expect(mockMessageCallback).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ollama-status' })
            );
        });
    });

    describe('uninstall-all edge cases', () => {
        it('should log and return when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            const mockNavigationCallback = jest.fn() as any;
            testView.setNavigationCallback(mockNavigationCallback);

            await testView.handleMessage({
                type: 'uninstall-all',
                deviceId: 'missing-device'
            } as any);

            expect(mockNavigationCallback).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for uninstall all',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });
    });

    describe('verify-installations edge cases', () => {
        it('should log and return when device not found', async () => {
            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(undefined)
            } as any;

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: {} as any
            });

            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: 'missing-device',
                appIds: ['ollama']
            } as any);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'device not found for verify installations',
                expect.objectContaining({ deviceId: 'missing-device' })
            );
        });

        it('should skip verification and warn for an unknown app id, still completing', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });

            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue(true);

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['not-a-real-app']
            } as any);

            expect(mockAppInstallationService.verifyAppInstallation).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'App not found for verification',
                expect.objectContaining({ appId: 'not-a-real-app' })
            );
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'verification-complete' })
            );
        });

        it('should send a failure result when verifyAppInstallation throws', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });

            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            mockAppInstallationService.verifyAppInstallation.mockRejectedValue(new Error('ssh failure'));

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['base-system']
            } as any);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Verification failed for app',
                expect.objectContaining({ appId: 'base-system', error: 'ssh failure' })
            );
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'verification-result',
                    appId: 'base-system',
                    isInstalled: false
                })
            );
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'verification-complete' })
            );
        });

        it('should stringify a non-Error rejection from verifyAppInstallation', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });

            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            mockAppInstallationService.verifyAppInstallation.mockRejectedValue('plain rejection');

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['base-system']
            } as any);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Verification failed for app',
                expect.objectContaining({ appId: 'base-system', error: 'plain rejection' })
            );
        });

        it('should process more than one batch when there are more than BATCH_SIZE apps', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true,
                device: 'Test device'
            });

            const mockDeviceService = {
                getDevice: jest.fn().mockReturnValue(mockDevice)
            } as any;
            const mockAppInstallationService = {
                verifyAppInstallation: jest.fn()
            } as any;
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue(true);

            const testView = new AppSelectionViewController({
                logger: mockLogger,
                telemetry: mockTelemetry,
                deviceService: mockDeviceService,
                appInstallationService: mockAppInstallationService
            });

            const mockMessageCallback = jest.fn();
            testView.setMessageCallback(mockMessageCallback);

            // 5 apps > BATCH_SIZE (3) to exercise the multi-batch loop
            await testView.handleMessage({
                type: 'verify-installations',
                deviceId: mockDevice.id,
                appIds: ['zrt', 'base-system', 'podman', 'ollama', 'snapd']
            } as any);

            expect(mockAppInstallationService.verifyAppInstallation).toHaveBeenCalledTimes(5);
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'verification-complete' })
            );
        });
    });

    describe('calculateAutoDependencies (private method)', () => {
        it('should mark base-system as an auto-dependency when selected and not installed', () => {
            const appDefinitions = [
                { id: 'base-system', name: 'Base System', dependencies: [] }
            ] as any;

            const result = (view as any).calculateAutoDependencies(
                ['base-system'],
                [],
                appDefinitions
            );

            expect(result).toContain('base-system');
        });

        it('should recursively collect and flag transitive dependencies that are also selected', () => {
            const appDefinitions = [
                { id: 'zrt', name: 'HP Z Runtime', dependencies: ['snapd'] },
                { id: 'snapd', name: 'snapd', dependencies: [] }
            ] as any;

            const result = (view as any).calculateAutoDependencies(
                ['zrt', 'snapd'],
                [],
                appDefinitions
            );

            expect(result).toContain('snapd');
        });

        it('should not re-collect dependencies already installed', () => {
            const appDefinitions = [
                { id: 'podman', name: 'Podman', dependencies: ['base-system'] },
                { id: 'base-system', name: 'Base System', dependencies: [] }
            ] as any;

            const result = (view as any).calculateAutoDependencies(
                ['podman', 'base-system'],
                ['base-system'],
                appDefinitions
            );

            expect(result).not.toContain('base-system');
        });

        it('should not flag base-system as an auto-dependency when it is already installed', () => {
            const appDefinitions = [
                { id: 'base-system', name: 'Base System', dependencies: [] }
            ] as any;

            const result = (view as any).calculateAutoDependencies(
                ['base-system'],
                ['base-system'],
                appDefinitions
            );

            expect(result).not.toContain('base-system');
        });
    });

    describe('performDeviceHealthCheck (private method)', () => {
        it('should perform its own health check when no result is supplied and return early if healthy', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: true
            });

            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);

            await (view as any).performDeviceHealthCheck(mockDevice);

            expect(deviceHealthCheckService.checkDeviceHealth).toHaveBeenCalledWith(mockDevice);
            expect(mockMessageCallback).not.toHaveBeenCalled();
        });

        it('should perform its own health check and show error overlay when unhealthy', async () => {
            const { deviceHealthCheckService } = require('../../services');
            deviceHealthCheckService.checkDeviceHealth.mockResolvedValue({
                isHealthy: false,
                error: 'no route to host'
            });

            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);

            await (view as any).performDeviceHealthCheck(mockDevice);

            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    error: 'no route to host'
                })
            );
        });

        it('should fall back to a default error message when the health check result has no error', async () => {
            const mockMessageCallback = jest.fn();
            view.setMessageCallback(mockMessageCallback);

            await (view as any).performDeviceHealthCheck(mockDevice, { isHealthy: false });

            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    error: 'Connection could not be established to the device.'
                })
            );
        });

        it('should catch and report unexpected errors thrown while showing the overlay', async () => {
            const mockMessageCallback = jest.fn().mockImplementation((msg: any) => {
                if (msg.errorTitle === 'Application installation status cannot be verified at this time') {
                    throw new Error('callback failed');
                }
            });
            view.setMessageCallback(mockMessageCallback);

            await (view as any).performDeviceHealthCheck(mockDevice, {
                isHealthy: false,
                error: 'timeout'
            });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error during device health check',
                expect.objectContaining({ error: 'callback failed' })
            );
            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Device Health Check Failed',
                    error: 'callback failed'
                })
            );
        });

        it('should stringify non-Error throwables in the catch branch', async () => {
            const mockMessageCallback = jest.fn().mockImplementation((msg: any) => {
                if (msg.errorTitle === 'Application installation status cannot be verified at this time') {
                    throw 'plain string failure';
                }
            });
            view.setMessageCallback(mockMessageCallback);

            await (view as any).performDeviceHealthCheck(mockDevice, {
                isHealthy: false,
                error: 'timeout'
            });

            expect(mockMessageCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'show-error-overlay',
                    errorTitle: 'Device Health Check Failed',
                    error: 'plain string failure'
                })
            );
        });
    });

    describe('static methods', () => {
        it('should return correct view ID', () => {
            expect(AppSelectionViewController.viewId()).toBe('apps/selection');
        });
    });
});
