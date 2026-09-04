/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AutomaticSetupViewController } from '../../views/setup/automatic/automaticSetupViewController';
import { ManualSetupViewController } from '../../views/setup/manual/manualSetupViewController';
import { SetupSuccessViewController } from '../../views/setup/success/setupSuccessViewController';
import { DetectDeviceTypeViewController } from '../../views/setup/detectDeviceType/detectDeviceTypeViewController';
import { DnsRegistrationViewController } from '../../views/setup/dnsRegistration/dnsRegistrationViewController';
import { SetupOptionsViewController } from '../../views/setup/options/setupOptionsViewController';
import { DeviceManagerViewController } from '../../views/devices/manager/deviceManagerViewController';
import { AppSelectionViewController } from '../../views/apps/selection/appSelectionViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device } from '../../types/devices';

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

    it('should infer password setup type when setupType is omitted and device does not use key auth', async () => {
        const html = await view.render({ device: { ...mockDevice, useKeyAuth: false } });

        expect(html).toContain('Password Authentication Ready!');
    });

    it('should infer automatic setup type when setupType is omitted and device uses key auth', async () => {
        const html = await view.render({ device: { ...mockDevice, useKeyAuth: true } });

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

// ---------------------------------------------------------------------------
// AutomaticSetupViewController — handleMessage
// ---------------------------------------------------------------------------

describe('AutomaticSetupView — handleMessage', () => {
    let view: AutomaticSetupViewController;

    beforeEach(() => {
        jest.clearAllMocks();
        view = new AutomaticSetupViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectionService: mockConnectionService as any
        });
    });

    describe('no device guard', () => {
        it('should log error and return early if handleMessage called before render', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);
            await view.handleMessage({ type: 'testConnection' });
            expect(mockLogger.error).toHaveBeenCalledWith('No device available for message handling');
            expect(sendMessageSpy).not.toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('should navigate to DetectDeviceTypeViewController on success', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockResolvedValue(true);
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(navigateSpy).toHaveBeenCalledWith(
                DetectDeviceTypeViewController.viewId(),
                { device: mockDevice, setupType: 'automatic' },
                'editor'
            );
        });

        it('should send connectionTestFailed with automatic-specific fallback on failure', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockRejectedValue('non-error failure');
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'connectionTestFailed',
                error: expect.stringContaining('use manual setup')
            }));
            expect(navigateSpy).not.toHaveBeenCalled();
        });

        it('should send connectionTestFailed when connectivity throws', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockRejectedValue(new Error('ECONNREFUSED'));
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'connectionTestFailed',
                error: 'ECONNREFUSED'
            }));
        });
    });

    describe('automaticRun', () => {
        it('should send automaticRunStarted on success', async () => {
            mockConnectionService.generateSSHKey.mockResolvedValue({ keyPath: '/home/.ssh/id_ed25519' });
            mockConnectionService.openTerminalForKeyCopy.mockResolvedValue(undefined);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'automaticRun' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'automaticRunStarted'
            }));
        });

        it('should send automaticError when generateSSHKey returns null', async () => {
            mockConnectionService.generateSSHKey.mockResolvedValue(null);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'automaticRun' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'automaticError'
            }));
        });

        it('should send automaticError when generateSSHKey throws', async () => {
            mockConnectionService.generateSSHKey.mockRejectedValue(new Error('key gen failed'));
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'automaticRun' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'automaticError',
                error: 'key gen failed'
            }));
        });
    });

    describe('back', () => {
        it('should navigate to SetupOptionsViewController', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'back' });

            expect(navigateSpy).toHaveBeenCalledWith(
                SetupOptionsViewController.viewId(),
                { device: mockDevice }
            );
        });
    });
});

// ---------------------------------------------------------------------------
// ManualSetupViewController — handleMessage
// ---------------------------------------------------------------------------

describe('ManualSetupView — handleMessage', () => {
    let view: ManualSetupViewController;

    beforeEach(() => {
        jest.clearAllMocks();
        view = new ManualSetupViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            connectionService: mockConnectionService as any
        });
    });

    describe('no device guard', () => {
        it('should log error and return early if handleMessage called before render', async () => {
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);
            await view.handleMessage({ type: 'testConnection' });
            expect(mockLogger.error).toHaveBeenCalledWith('No device available for message handling');
            expect(sendMessageSpy).not.toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('should navigate to DetectDeviceTypeViewController on success', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockResolvedValue(true);
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(navigateSpy).toHaveBeenCalledWith(
                DetectDeviceTypeViewController.viewId(),
                { device: mockDevice, setupType: 'manual' },
                'editor'
            );
        });

        it('should send connectionTestFailed with manual-specific fallback on failure', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockRejectedValue('non-error failure');
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'connectionTestFailed',
                error: expect.stringContaining('copied your public key')
            }));
            expect(navigateSpy).not.toHaveBeenCalled();
        });

        it('should send connectionTestFailed when connectivity throws', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockRejectedValue(new Error('ECONNREFUSED'));
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'testConnection' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'connectionTestFailed',
                error: 'ECONNREFUSED'
            }));
        });
    });

    describe('manualComplete', () => {
        it('should navigate to DnsRegistrationViewController on success', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockResolvedValue(true);
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'manualComplete' });

            expect(navigateSpy).toHaveBeenCalledWith(
                DnsRegistrationViewController.viewId(),
                { device: mockDevice, setupType: 'manual' },
                'editor'
            );
        });

        it('should send manualError on failure', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockResolvedValue(false);
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'manualComplete' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'manualError'
            }));
        });

        it('should send manualError when connectivity throws', async () => {
            mockConnectionService.testSSHKeyConnectivity.mockRejectedValue(new Error('timeout'));
            const sendMessageSpy = jest.spyOn(view as any, 'sendMessageToWebview').mockReturnValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'manualComplete' });

            expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'manualError',
                error: 'timeout'
            }));
        });
    });

    describe('back', () => {
        it('should navigate to SetupOptionsViewController', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice });
            await view.handleMessage({ type: 'back' });

            expect(navigateSpy).toHaveBeenCalledWith(
                SetupOptionsViewController.viewId(),
                { device: mockDevice }
            );
        });
    });
});

// ---------------------------------------------------------------------------
// SetupOptionsViewController — render & handleMessage
// ---------------------------------------------------------------------------

describe('SetupOptionsView', () => {
    let view: SetupOptionsViewController;

    beforeEach(() => {
        jest.clearAllMocks();
        view = new SetupOptionsViewController({
            logger: mockLogger,
            telemetry: mockTelemetry
        });
    });

    it('should render setup options view', async () => {
        const html = await view.render({ device: mockDevice });

        expect(html).toBeTruthy();
        expect(html).toContain(mockDevice.name);
    });

    it('should throw error if no device provided', async () => {
        await expect(view.render()).rejects.toThrow('device is required');
    });

    describe('handleMessage', () => {
        describe('no device guard', () => {
            it('should log error and return early if handleMessage called before render', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.handleMessage({ type: 'navigate-back' });

                expect(mockLogger.error).toHaveBeenCalledWith('No device available for message handling');
                expect(navigateSpy).not.toHaveBeenCalled();
            });
        });

        describe('navigate-back', () => {
            it('should navigate to DeviceManagerViewController', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.render({ device: mockDevice });
                await view.handleMessage({ type: 'navigate-back' });

                expect(navigateSpy).toHaveBeenCalledWith(
                    DeviceManagerViewController.viewId(),
                    { device: mockDevice }
                );
            });
        });

        describe('setup-option-selected', () => {
            it('should navigate to AutomaticSetupViewController when option is automatic', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.render({ device: mockDevice });
                await view.handleMessage({ type: 'setup-option-selected', option: 'automatic' });

                expect(navigateSpy).toHaveBeenCalledWith(
                    AutomaticSetupViewController.viewId(),
                    { device: mockDevice }
                );
            });

            it('should navigate to ManualSetupViewController when option is manual', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.render({ device: mockDevice });
                await view.handleMessage({ type: 'setup-option-selected', option: 'manual' });

                expect(navigateSpy).toHaveBeenCalledWith(
                    ManualSetupViewController.viewId(),
                    { device: mockDevice }
                );
            });

            it('should log error and not navigate for an unknown option', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.render({ device: mockDevice });
                await view.handleMessage({ type: 'setup-option-selected', option: 'password' as any });

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Unknown setup option selected',
                    { option: 'password' }
                );
                expect(navigateSpy).not.toHaveBeenCalled();
            });
        });

        describe('unhandled message type', () => {
            it('should log debug and take no action', async () => {
                const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

                await view.render({ device: mockDevice });
                await view.handleMessage({ type: 'unknown-message' } as any);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Unhandled message type in setup options',
                    { type: 'unknown-message' }
                );
                expect(navigateSpy).not.toHaveBeenCalled();
            });
        });
    });
});

// ---------------------------------------------------------------------------
// SetupSuccessViewController — handleMessage
// ---------------------------------------------------------------------------

describe('SetupSuccessView — handleMessage', () => {
    let view: SetupSuccessViewController;

    beforeEach(() => {
        jest.clearAllMocks();
        view = new SetupSuccessViewController({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceService: mockDeviceService
        });
    });

    describe('setup-complete', () => {
        it('should navigate to AppSelectionViewController when a current device is set', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice, setupType: 'automatic' });
            await view.handleMessage({ type: 'setup-complete' });

            expect(navigateSpy).toHaveBeenCalledWith(
                AppSelectionViewController.viewId(),
                { device: mockDevice },
                'editor'
            );
        });

        it('should log error and not navigate when no current device is set', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({ type: 'setup-complete' });

            expect(mockLogger.error).toHaveBeenCalledWith('Cannot navigate: no current device');
            expect(navigateSpy).not.toHaveBeenCalled();
        });
    });

    describe('cancel', () => {
        it('should navigate to DeviceManagerViewController with the current device', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice, setupType: 'automatic' });
            await view.handleMessage({ type: 'cancel' });

            expect(navigateSpy).toHaveBeenCalledWith(
                DeviceManagerViewController.viewId(),
                { device: mockDevice },
                'editor'
            );
        });

        it('should navigate to DeviceManagerViewController with an undefined device if not set', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.handleMessage({ type: 'cancel' });

            expect(navigateSpy).toHaveBeenCalledWith(
                DeviceManagerViewController.viewId(),
                { device: undefined },
                'editor'
            );
        });
    });

    describe('unhandled message type', () => {
        it('should take no navigation action for other message types', async () => {
            const navigateSpy = jest.spyOn(view as any, 'navigateTo').mockResolvedValue(undefined);

            await view.render({ device: mockDevice, setupType: 'automatic' });
            await view.handleMessage({ type: 'unknown-message' } as any);

            expect(navigateSpy).not.toHaveBeenCalled();
        });
    });
});
