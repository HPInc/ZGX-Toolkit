/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppSelectionViewController } from '../../views/apps/selection/appSelectionViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device } from '../../types/devices';
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
            ]
        },
    ],
    getAllApps: jest.fn(() => [
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
    ]),
    getAppById: jest.fn((id: string) => {
        const apps = [
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
            deleteDevice: jest.fn(),
        } as any;

        const mockAppInstallationService = {
            verifyAppInstallation: jest.fn(),
        } as any;

        const mockPasswordService = {
            promptForPassword: jest.fn(),
            showPasswordValidationError: jest.fn(),
            showPasswordRequiredWarning: jest.fn(),
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
            device: mockDevice,
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
            device: mockDevice,
        });

        expect(html).toContain('System Stack');
        expect(html).toContain('Essential system libraries and tools');
    });

    it('should display apps in grid', async () => {
        const html = await view.render({
            device: mockDevice,
        });

        expect(html).toContain('Base System');
        expect(html).toContain('🔧');
        expect(html).toContain('Python development environment');
        expect(html).toContain('Podman');
        expect(html).toContain('🦭');
        expect(html).toContain('Container engine');
    });

    it('should mark selected apps', async () => {
        const deviceWithSelection = {
            ...mockDevice,
            selectedApps: ['base-system', 'podman'] as any
        };

        const html = await view.render({
            device: deviceWithSelection,
        });

        expect(html).toContain('app-selected');
    });

    it('should include action buttons', async () => {
        const html = await view.render({
            device: mockDevice,
        });

        expect(html).toContain('Install');
        expect(html).toContain('Continue to Inference');
        expect(html).toContain('Close');
        expect(html).toContain('Uninstall All');
    });

    it('should include selection info', async () => {
        const html = await view.render({
            device: mockDevice,
        });

        expect(html).toContain('Base System is always required');
        expect(html).toContain('Dependencies will be automatically selected');
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render({} as any)).rejects.toThrow('device required');
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
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue(true);
            
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
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue(true);
            
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
            
            mockAppInstallationService.verifyAppInstallation.mockResolvedValue(true);
            
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
    });

    describe('static methods', () => {
        it('should return correct view ID', () => {
            expect(AppSelectionViewController.viewId()).toBe('apps/selection');
        });
    });
});
