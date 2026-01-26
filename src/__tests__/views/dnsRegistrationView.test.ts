/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DnsRegistrationViewController } from '../../views/setup/dnsRegistration/dnsRegistrationViewController';
import { SetupSuccessViewController } from '../../views/setup/success/setupSuccessViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { ConnectionService } from '../../services/connectionService';
import { Device } from '../../types/devices';
import { jest } from '@jest/globals';

describe('DnsRegistrationViewController', () => {
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
        flush: jest.fn(),
        isEnabled: jest.fn().mockReturnValue(false),
        setEnabled: jest.fn(),
        dispose: jest.fn() as any
    } as any;

    // Mock connection service
    const mockConnectionService: jest.Mocked<ConnectionService> = {
        checkDNSServiceFileExists: jest.fn(),
        validatePasswordForDNS: jest.fn(),
        registerDNSServiceWithAvahi: jest.fn(),
    } as any;

    // Mock device service
    const mockDeviceService = {
        updateDevice: jest.fn(),
        getDevice: jest.fn(),
    } as any;

    const mockDevice: Device = {
        id: 'test-device-1',
        name: 'Test Device',
        host: '192.168.1.100',
        username: 'root',
        port: 22,
        isSetup: false,
        useKeyAuth: false,
        keySetup: {
            keyGenerated: false,
            keyCopied: false,
            connectionTested: false
        },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
    };

    function createController() {
        return new DnsRegistrationViewController({
            logger: mockLogger as any,
            telemetry: mockTelemetry as any,
            connectionService: mockConnectionService,
            deviceService: mockDeviceService
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers(); // Reset to real timers by default
    });

    describe('viewId', () => {
        it('should return correct view ID', () => {
            expect(DnsRegistrationViewController.viewId()).toBe('setup/dnsRegistration');
        });
    });

    describe('render', () => {
        it('should throw error if no device provided', async () => {
            const controller = createController();
            await expect(controller.render()).rejects.toThrow('device required for DNS registration view');
            expect(mockLogger.error).toHaveBeenCalledWith('No device provided to mDNS registration view');
        });

        it('should render with device name and track telemetry', async () => {
            const controller = createController();

            const html = await controller.render({ device: mockDevice });

            expect(html).toContain('Test Device');
            expect(html).toContain('DNS Service Registration');
            expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
                eventType: TelemetryEventType.View,
                action: 'navigate',
                properties: {
                    toView: 'setup.dnsRegistration',
                },
            });
        });

        it('should store setupType when provided', async () => {
            const controller = createController();

            await controller.render({ device: mockDevice, setupType: 'automatic' });

            // Internal state check through message handling
            expect(mockLogger.debug).toHaveBeenCalledWith('Rendering mDNS registration view', { device: 'Test Device' });
        });
    });

    describe('showPasswordPrompt', () => {
        it('should always show password prompt without checking file existence', async () => {
            const controller = createController();
            
            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });

            // Wait for async showPasswordPrompt
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockConnectionService.checkDNSServiceFileExists).not.toHaveBeenCalled();
            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
        });
    });

    describe('handleMessage - validatePassword', () => {
        it('should validate password and start DNS registration on success', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'abc123'
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);
            const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass123' });

            expect(mockConnectionService.validatePasswordForDNS).toHaveBeenCalledWith(mockDevice, 'testpass123');
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: true
            });
            expect(mockConnectionService.registerDNSServiceWithAvahi).toHaveBeenCalledWith(mockDevice, 'testpass123');
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'registrationComplete',
                success: true
            });

            // Wait for navigation timeout
            await new Promise(resolve => setTimeout(resolve, 1600));
            expect(navigateSpy).toHaveBeenCalledWith(
                SetupSuccessViewController.viewId(),
                { device: expect.objectContaining({ dnsInstanceName: expect.any(String) }) },
                'editor'
            );
        });

        it('should send error message on invalid password', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({
                valid: false,
                isConnectionError: false,
                error: 'Incorrect password. Please try again.'
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'wrongpass' });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: false,
                error: 'Incorrect password. Please try again.'
            });
            expect(mockConnectionService.registerDNSServiceWithAvahi).not.toHaveBeenCalled();
        });

        it('should send connection error message when validation has connection error', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({
                valid: false,
                isConnectionError: true,
                error: 'SSH connection failed'
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: false,
                error: 'Connection error. Please check your network and try again.'
            });
        });

        it('should handle validation exception gracefully', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockRejectedValue(new Error('Network timeout'));

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(mockLogger.error).toHaveBeenCalledWith('Error during password validation', {
                error: 'Network timeout'
            });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'passwordValidationResult',
                valid: false,
                error: 'An unexpected error occurred. Please try again.'
            });
        });
    });

    describe('startDNSRegistration', () => {
        it('should handle already registered service', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: true,
                errorType: 'none' as any
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(mockLogger.info).toHaveBeenCalledWith('mDNS hpzgx service registered successfully', { device: 'Test Device', identifier: undefined });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'registrationComplete',
                success: true
            });
        });

        it('should handle registration failure with invalid password', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: false,
                alreadyRegistered: false,
                errorType: 'invalid_password' as any,
                message: 'Invalid password'
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'registrationComplete',
                success: false,
                error: 'Invalid password. Please try again.',
                allowRetry: true
            });
        });

        it('should handle registration failure with other error', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: false,
                alreadyRegistered: false,
                errorType: 'service_file_creation_failed' as any,
                message: 'Failed to create service file'
            });

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'registrationComplete',
                success: false,
                error: 'Failed to create service file'
            });
        });

        it('should handle registration exception', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockRejectedValue(new Error('SSH error'));

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            expect(mockLogger.error).toHaveBeenCalledWith('Exception during mDNS registration', {
                device: 'Test Device',
                error: 'SSH error'
            });
            expect(sendMessageSpy).toHaveBeenCalledWith({
                type: 'registrationComplete',
                success: false,
                error: 'SSH error'
            });
        });
    });

    describe('navigateToSuccess', () => {
        it('should update device properties and navigate with automatic setupType', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'xyz789'
            });

            const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice, setupType: 'automatic' });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            // Wait for navigation timeout
            await new Promise(resolve => setTimeout(resolve, 1600));

            expect(navigateSpy).toHaveBeenCalledWith(
                SetupSuccessViewController.viewId(),
                {
                    device: expect.objectContaining({
                        isSetup: true,
                        useKeyAuth: true,
                        dnsInstanceName: expect.any(String),
                        keySetup: {
                            keyGenerated: true,
                            keyCopied: true,
                            connectionTested: true
                        }
                    })
                },
                'editor'
            );
        });

        it('should navigate with manual setupType', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'xyz789'
            });

            const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice, setupType: 'manual' });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            // Wait for navigation timeout
            await new Promise(resolve => setTimeout(resolve, 1600));

            expect(navigateSpy).toHaveBeenCalledWith(
                SetupSuccessViewController.viewId(),
                {
                    device: expect.objectContaining({
                        isSetup: true,
                        useKeyAuth: true,
                        dnsInstanceName: expect.any(String)
                    }),
                    setupType: 'manual'
                },
                'editor'
            );
        });

        it('should return early if currentDevice is not set', async () => {
            const controller = createController();
            
            // Call navigateToSuccess directly without setting currentDevice
            const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
            
            await (controller as any).navigateToSuccess();

            // Should return early without navigating
            expect(navigateSpy).not.toHaveBeenCalled();
        });

        it('should navigate to device manager for migration setupType', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'abc123'
            });

            const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice, setupType: 'migration' });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            // Wait for navigation timeout
            await new Promise(resolve => setTimeout(resolve, 1600));

            expect(mockLogger.debug).toHaveBeenCalledWith('mDNS registration complete for existing device, returning to device manager');
            expect(navigateSpy).toHaveBeenCalledWith('devices/manager', {}, 'editor');
        });
    });

    describe('error handling', () => {
        it('should log error if no device available for message handling', async () => {
            const controller = createController();
            
            // Don't render, so currentDevice is undefined
            await controller.handleMessage({ type: 'validatePassword', password: 'test' });

            expect(mockLogger.error).toHaveBeenCalledWith('No device available for message handling');
        });

        it('should handle back message gracefully', async () => {
            const controller = createController();

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'back' });

            expect(mockLogger.debug).toHaveBeenCalledWith('Unhandled message type in mDNS registration', { type: 'back' });
        });
    });

    describe('disposal handling in render', () => {
        it('should return early from timeout if controller is disposed', async () => {
            jest.useFakeTimers();
            const controller = createController();
            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });
            
            // Set isDisposed after render but before timeout fires
            (controller as any).isDisposed = true;

            // Advance timers to trigger the timeout callback
            jest.advanceTimersByTime(100);

            // showPasswordPrompt should not send message because isDisposed was true
            expect(sendMessageSpy).not.toHaveBeenCalled();

            jest.useRealTimers();
        });

        it('should log error and fallback to password prompt when showPasswordPrompt throws Error', async () => {
            const controller = createController();
            jest.spyOn(controller as any, 'showPasswordPrompt').mockRejectedValue(new Error('Connection failed'));

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });

            // Wait for timeout to execute
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockLogger.error).toHaveBeenCalledWith('Error showing password prompt', {
                device: 'Test Device',
                error: 'Connection failed'
            });
            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
        });

        it('should handle non-Error exceptions in showPasswordPrompt', async () => {
            const controller = createController();
            jest.spyOn(controller as any, 'showPasswordPrompt').mockRejectedValue('String error');

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });

            // Wait for timeout to execute
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockLogger.error).toHaveBeenCalledWith('Error showing password prompt', {
                device: 'Test Device',
                error: 'String error'
            });
            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
        });

        it('should handle Buffer exceptions in showPasswordPrompt', async () => {
            const controller = createController();
            jest.spyOn(controller as any, 'showPasswordPrompt').mockRejectedValue(Buffer.from('buffer error'));

            const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockResolvedValue(undefined);

            await controller.render({ device: mockDevice });

            // Wait for timeout to execute
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockLogger.error).toHaveBeenCalledWith('Error showing password prompt', {
                device: 'Test Device',
                error: expect.any(String)
            });
            expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'showPasswordPrompt' });
        });
    });

    describe('dispose', () => {
        it('should set isDisposed flag to true', () => {
            const controller = createController();
            
            expect((controller as any).isDisposed).toBe(false);
            
            controller.dispose();
            
            expect((controller as any).isDisposed).toBe(true);
        });

        it('should clear checkTimeoutHandle if it exists', async () => {
            const controller = createController();

            // Render to create the timeout
            await controller.render({ device: mockDevice });

            // Verify timeout handle exists
            expect((controller as any).checkTimeoutHandle).toBeDefined();

            // Dispose
            controller.dispose();

            // Verify timeout handle is cleared
            expect((controller as any).checkTimeoutHandle).toBeUndefined();
        });

        it('should not error if checkTimeoutHandle is undefined', () => {
            const controller = createController();
            
            // checkTimeoutHandle is undefined before render
            expect((controller as any).checkTimeoutHandle).toBeUndefined();

            // Should not throw
            expect(() => controller.dispose()).not.toThrow();
        });

        it('should clear navigationTimeoutHandle if it exists', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'abc123'
            });

            // Render and trigger registration to create navigation timeout
            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });

            // Wait for registration to complete and navigation timeout to be created
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify navigation timeout handle exists
            expect((controller as any).navigationTimeoutHandle).toBeDefined();

            // Dispose
            controller.dispose();

            // Verify navigation timeout handle is cleared
            expect((controller as any).navigationTimeoutHandle).toBeUndefined();
        });

        it('should not error if navigationTimeoutHandle is undefined', () => {
            const controller = createController();
            
            // navigationTimeoutHandle is undefined before navigation
            expect((controller as any).navigationTimeoutHandle).toBeUndefined();

            // Should not throw
            expect(() => controller.dispose()).not.toThrow();
        });

        it('should clear both timeout handles when both exist', async () => {
            const controller = createController();
            mockConnectionService.validatePasswordForDNS.mockResolvedValue({ valid: true, isConnectionError: false });
            mockConnectionService.registerDNSServiceWithAvahi.mockResolvedValue({
                success: true,
                alreadyRegistered: false,
                errorType: 'none' as any,
                deviceIdentifier: 'abc123'
            });

            await controller.render({ device: mockDevice });
            await controller.handleMessage({ type: 'validatePassword', password: 'testpass' });
            await new Promise(resolve => setTimeout(resolve, 100));

            // Both handles should exist
            expect((controller as any).checkTimeoutHandle).toBeDefined();
            expect((controller as any).navigationTimeoutHandle).toBeDefined();

            controller.dispose();

            // Both should be cleared
            expect((controller as any).checkTimeoutHandle).toBeUndefined();
            expect((controller as any).navigationTimeoutHandle).toBeUndefined();
            expect((controller as any).isDisposed).toBe(true);
        });
    });
});
