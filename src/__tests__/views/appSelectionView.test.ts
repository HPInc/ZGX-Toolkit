/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppSelectionViewController } from '../../views/apps/selection/appSelectionViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device } from '../../types/devices';
import { jest } from '@jest/globals';

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
            ]
        },
    ],
}));

describe('AppSelectionView', () => {
    let view: AppSelectionViewController;

    beforeEach(() => {
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
    });

    it('should render app selection view', async () => {

        const html = await view.render({
            device: mockDevice,
        });

        expect(html).toBeTruthy();
        expect(html).toContain('Application Install');
        expect(html).toContain(mockDevice.name);
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
});
