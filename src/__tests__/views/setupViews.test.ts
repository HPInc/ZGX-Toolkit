/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AutomaticSetupViewController } from '../../views/setup/automatic/automaticSetupViewController';
import { ManualSetupViewController } from '../../views/setup/manual/manualSetupViewController';
import { SetupSuccessViewController } from '../../views/setup/success/setupSuccessViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device } from '../../types/devices';
import { deviceStore } from '../../store/deviceStore';
import { DeviceService } from '../../services/deviceService';

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
    dispose: jest.fn().mockResolvedValue(undefined)
} as any;

// Mock connection service
const mockConnectionService = {
    generateSSHKey: jest.fn().mockResolvedValue({
        keyPath: '/home/user/.ssh/id_ed25519',
        publicKeyPath: '/home/user/.ssh/id_ed25519.pub',
        publicKey: 'ssh-ed25519 AAAA...'
    }),
    hasIDED25519Key: jest.fn().mockReturnValue(true),
    testSSHKeyConnectivity: jest.fn().mockResolvedValue(true),
    openTerminalForKeyCopy: jest.fn().mockResolvedValue({}),
    generateManualSetupCommands: jest.fn().mockReturnValue({
        windows: { keyGen: 'ssh-keygen...', copy: 'Get-Content...' },
        linux: { keyGen: 'ssh-keygen...', copy: 'ssh-copy-id...' },
        mac: { keyGen: 'ssh-keygen...', copy: 'ssh-copy-id...' },
        testCommand: 'ssh testuser@192.168.1.100'
    })
};

// Mock device store
const mockDeviceStore = {
    get: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    subscribe: jest.fn()
} as any;

// Mock device service
const mockDeviceService = {
    createDevice: jest.fn(),
    updateDevice: jest.fn(),
    deleteDevice: jest.fn()
} as any;

// Mock device
const mockDevice: Device = {
    id: 'test-device-1',
    name: 'Test device',
    host: '192.168.1.100',
    username: 'testuser',
    port: 22,
    isSetup: false,
    useKeyAuth: false,
    keySetup: {
        keyGenerated: false,
        keyCopied: false,
        connectionTested: false
    },
    createdAt: new Date().toISOString()
};

describe('AutomaticSetupView', () => {
    let view: AutomaticSetupViewController;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        view = new AutomaticSetupViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectionService: mockConnectionService as any
        });
        
        // Log warn calls after view construction
        const warnCalls = (mockLogger.warn as jest.Mock).mock.calls;
        if (warnCalls.length > 0) {
            console.log('Template loading warnings:');
            warnCalls.forEach((call, idx) => {
                console.log(`Warn ${idx}:`, JSON.stringify(call, null, 2));
            });
        }
    });

    it('should render automatic setup view', async () => {
        // Debug: check what's in the view template
        console.log('Template length:', (view as any).template.length);
        console.log('Styles length:', (view as any).styles.length);
        
        // Log any errors that occurred during template loading
        const errorCalls = (mockLogger.error as jest.Mock).mock.calls;
        if (errorCalls.length > 0) {
            console.log('Template loading errors:');
            errorCalls.forEach((call, idx) => {
                console.log(`Error ${idx}:`, JSON.stringify(call, null, 2));
            });
        } else {
            console.log('No errors logged during template loading');
        }

        const html = await view.render({ device: mockDevice });
        console.log('Rendered HTML length:', html.length);

        expect(html).toBeTruthy();
        expect(html).toContain('Automatic SSH Key Setup');
        expect(html).toContain(mockDevice.name);
        expect(html).toContain('Run Setup');
        expect(html).toContain('Test Connection');
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render()).rejects.toThrow('device required');
    });

    it('should include styles and instructions', async () => {
        const html = await view.render({ device: mockDevice });

        expect(html).toContain('Automatic steps:');
        expect(html).toContain('Generate SSH key locally');
    });
});

describe('ManualSetupView', () => {
    let view: ManualSetupViewController;

    beforeEach(() => {
        view = new ManualSetupViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectionService: mockConnectionService as any
        });
    });

    it('should render manual setup view', async () => {
        const html = await view.render({ device: mockDevice });

        expect(html).toBeTruthy();
        expect(html).toContain('Manual SSH Key Setup');
        expect(html).toContain(mockDevice.name);
        expect(html).toContain('Test Connection');
    });

    it('should include platform-specific commands', async () => {
        const html = await view.render({ device: mockDevice });

        expect(html).toContain('Windows');
        expect(html).toContain('Linux');
        expect(html).toContain('Mac');
        expect(html).toContain('ssh-keygen');
        expect(html).toContain(mockDevice.username);
        expect(html).toContain(mockDevice.host);
    });

    it('should include copy buttons', async () => {
        const html = await view.render({ device: mockDevice });

        expect(html).toContain('copy-button');
        expect(html).toContain('data-copy');
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render()).rejects.toThrow('device required');
    });
});

describe('SetupSuccessView', () => {
    let view: SetupSuccessViewController;

    beforeEach(() => {
        view = new SetupSuccessViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService
        });
    });

    it('should render automatic setup success', async () => {
        const html = await view.render({ 
            device: mockDevice, 
            setupType: 'automatic' 
        });

        expect(html).toBeTruthy();
        expect(html).toContain('Automatic Setup Complete!');
        expect(html).toContain('🎉');
        expect(html).toContain(mockDevice.name);
        expect(html).toContain('Continue');
    });

    it('should render manual setup success', async () => {
        const html = await view.render({ 
            device: mockDevice, 
            setupType: 'manual' 
        });

        expect(html).toContain('Manual Setup Complete!');
        expect(html).toContain('✅');
        expect(html).toContain('passwordless connection');
    });

    it('should render default setup success', async () => {
        const html = await view.render({ 
            device: mockDevice, 
            setupType: 'password' 
        });

        expect(html).toContain('Password Authentication Ready!');
        expect(html).toContain('🔑');
        expect(html).toContain('prompted for your password');
    });

    it('should default to automatic if no setup type provided', async () => {
        const html = await view.render({ device: mockDevice, setupType: 'automatic' });

        expect(html).toContain('Automatic Setup Complete!');
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render({} as any)).rejects.toThrow('device required');
    });

    it('should include Continue and Close buttons', async () => {
        const html = await view.render({ device: mockDevice, setupType: 'automatic' });

        expect(html).toContain('Continue');
        expect(html).toContain('Close');
        expect(html).toContain('setupComplete()');
        expect(html).toContain('closePage()');
    });
});
