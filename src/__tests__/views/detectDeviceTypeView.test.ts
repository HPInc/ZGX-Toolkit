/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DetectDeviceTypeViewController } from '../../views/setup/detectDeviceType/detectDeviceTypeViewController';
import { AutomaticSetupViewController } from '../../views/setup/automatic/automaticSetupViewController';
import { DnsRegistrationViewController } from '../../views/setup/dnsRegistration/dnsRegistrationViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService, TelemetryEventType } from '../../types/telemetry';
import { Device, DeviceFingerprint, DeviceType } from '../../types/devices';
import { DeviceFingerprintService } from '../../services/deviceFingerprintService';
import { DeviceService } from '../../services/deviceService';
import { jest } from '@jest/globals';

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

const mockTelemetry: ITelemetryService = {
    trackEvent: jest.fn(),
    trackError: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(false),
    setEnabled: jest.fn(),
    dispose: jest.fn() as any
} as any;

const mockDeviceFingerprintService: jest.Mocked<Pick<DeviceFingerprintService, 'buildDeviceFingerprint' | 'updateDeviceFingerprint'>> = {
    buildDeviceFingerprint: jest.fn(),
    updateDeviceFingerprint: jest.fn()
};

const mockDeviceService: jest.Mocked<Pick<DeviceService, 'updateDevice'>> = {
    updateDevice: jest.fn()
};

const mockDevice: Device = {
    id: 'test-device-1',
    name: 'Test Device',
    host: '192.168.1.100',
    username: 'zgx',
    port: 22,
    isSetup: false,
    useKeyAuth: true,
    keySetup: {
        keyGenerated: true,
        keyCopied: true,
        connectionTested: true
    },
    createdAt: '2026-01-01T00:00:00Z'
};

function createController(): DetectDeviceTypeViewController {
    return new DetectDeviceTypeViewController({
        logger: mockLogger,
        telemetry: mockTelemetry,
        deviceFingerprintService: mockDeviceFingerprintService as unknown as DeviceFingerprintService,
        deviceService: mockDeviceService as unknown as DeviceService
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.ZGXFury });
    mockDeviceService.updateDevice.mockResolvedValue(undefined as any);
});

// ---------------------------------------------------------------------------
// viewId
// ---------------------------------------------------------------------------

describe('viewId', () => {
    it('should return correct view ID', () => {
        expect(DetectDeviceTypeViewController.viewId()).toBe('setup/detectDeviceType');
    });
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

describe('render', () => {
    it('should throw error when no device is provided', async () => {
        const controller = createController();
        await expect(controller.render()).rejects.toThrow('device required for detect device type view');
        expect(mockLogger.error).toHaveBeenCalledWith('No device provided to detect device type view');
    });

    it('should render with device name and track telemetry', async () => {
        const controller = createController();
        const html = await controller.render({ device: mockDevice });

        expect(html).toContain('Test Device');
        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: { toView: 'setup.detectDeviceType' }
        });
    });

    it('should render successfully with setupType automatic', async () => {
        const controller = createController();
        const html = await controller.render({ device: mockDevice, setupType: 'automatic' });
        expect(html).toBeTruthy();
    });

    it('should render successfully with setupType manual', async () => {
        const controller = createController();
        const html = await controller.render({ device: mockDevice, setupType: 'manual' });
        expect(html).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// handleMessage — startFingerprintDetection
// ---------------------------------------------------------------------------

describe('handleMessage — startFingerprintDetection', () => {
    it('should send fingerprintResult with known type when probe returns ZGXFury', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.ZGXFury });

        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'fingerprintResult',
            deviceType: DeviceType.ZGXFury,
            displayName: 'ZGX Fury',
            requiresSelection: false,
            detectedLabel: null
        }));
    });

    it('should send requiresSelection: true and detectedLabel "Other" when probe returns Other', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Other });

        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'fingerprintResult',
            requiresSelection: true,
            detectedLabel: 'Other'
        }));
    });

    it('should send requiresSelection: true and detectedLabel "Device unknown" when probe returns Unknown', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Unknown });

        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'fingerprintResult',
            requiresSelection: true,
            detectedLabel: 'Device unknown'
        }));
    });

    it('should send requiresSelection: true and detectedLabel "Device unknown" when probe returns Pending', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Pending });

        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'fingerprintResult',
            requiresSelection: true,
            detectedLabel: 'Device unknown'
        }));
    });

    it('should send requiresSelection: true with "Device unknown" fallback when probe rejects', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockRejectedValue(new Error('SSH timeout'));

        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'fingerprintResult',
            deviceType: null,
            displayName: null,
            requiresSelection: true,
            detectedLabel: 'Device unknown'
        }));
    });

    it('should log error but not re-throw when probe rejects', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockRejectedValue(new Error('SSH timeout'));

        jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        await controller.render({ device: mockDevice });
        await expect(controller.handleMessage({ type: 'startFingerprintDetection' })).resolves.not.toThrow();
        expect(mockLogger.error).toHaveBeenCalledWith(
            'Device type detection failed',
            expect.objectContaining({ error: 'SSH timeout' })
        );
    });
});

// ---------------------------------------------------------------------------
// handleMessage — confirmDeviceType
// ---------------------------------------------------------------------------

describe('handleMessage — confirmDeviceType', () => {
    it('should call updateDeviceFingerprint and updateDevice with correct args', async () => {
        const controller = createController();
        const updatedFingerprint: DeviceFingerprint = { deviceType: DeviceType.ZGXNano };
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue(updatedFingerprint);

        jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.ZGXNano });

        expect(mockDeviceFingerprintService.updateDeviceFingerprint).toHaveBeenCalledWith(
            mockDevice.fingerprint,
            { deviceType: DeviceType.ZGXNano }
        );
        expect(mockDeviceService.updateDevice).toHaveBeenCalledWith(
            mockDevice.id,
            { fingerprint: updatedFingerprint }
        );
    });

    it('should navigate to DnsRegistrationViewController with updated device and setupType', async () => {
        const controller = createController();
        const updatedFingerprint: DeviceFingerprint = { deviceType: DeviceType.Z8 };
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue(updatedFingerprint);

        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z8 });

        expect(navigateSpy).toHaveBeenCalledWith(
            DnsRegistrationViewController.viewId(),
            {
                device: expect.objectContaining({ fingerprint: updatedFingerprint }),
                setupType: 'automatic'
            },
            'editor'
        );
    });

    it('should navigate to DnsRegistrationViewController with setupType manual', async () => {
        const controller = createController();
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.Z4 });

        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
        await controller.render({ device: mockDevice, setupType: 'manual' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z4 });

        expect(navigateSpy).toHaveBeenCalledWith(
            DnsRegistrationViewController.viewId(),
            expect.objectContaining({ setupType: 'manual' }),
            'editor'
        );
    });

    it('should still navigate even when updateDevice rejects (persistence failure is non-fatal)', async () => {
        const controller = createController();
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.ZGXFury });
        mockDeviceService.updateDevice.mockRejectedValue(new Error('DB write failed'));

        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.ZGXFury });

        expect(mockLogger.error).toHaveBeenCalledWith(
            'Failed to persist device type',
            expect.objectContaining({ error: 'DB write failed' })
        );
        expect(navigateSpy).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// handleMessage — confirmDeviceType — telemetry
// ---------------------------------------------------------------------------

describe('handleMessage — confirmDeviceType — telemetry', () => {
    it('should emit detectedType from probe result when probe ran and user confirms same type', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Z2 });
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.Z2 });

        jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'startFingerprintDetection' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z2 });

        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventType: TelemetryEventType.DeviceTypeDetection,
            action: 'confirmed',
            properties: expect.objectContaining({
                detectedType: DeviceType.Z2,
                confirmedType: DeviceType.Z2,
                wasOverridden: 'false',
                setupType: 'automatic'
            })
        }));
    });

    it('should set wasOverridden: true when user changes probe result', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Z2 });
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.Z4 });

        jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.render({ device: mockDevice, setupType: 'manual' });
        await controller.handleMessage({ type: 'startFingerprintDetection' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z4 });

        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({
                detectedType: DeviceType.Z2,
                confirmedType: DeviceType.Z4,
                wasOverridden: 'true'
            })
        }));
    });

    it('should use Pending detectedType when probe threw (no result) and user confirms', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockRejectedValue(new Error('probe failed'));
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.Z4 });

        jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'startFingerprintDetection' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z4 });

        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({
                detectedType: DeviceType.Pending,
                confirmedType: DeviceType.Z4,
                wasOverridden: 'true'
            })
        }));
    });

    it('should track confirmedType from re-entry session after cancel clears prior probe result', async () => {
        const controller = createController();
        mockDeviceFingerprintService.buildDeviceFingerprint.mockResolvedValue({ deviceType: DeviceType.Z2 });
        mockDeviceFingerprintService.updateDeviceFingerprint.mockReturnValue({ deviceType: DeviceType.Z4 });

        jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);
        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);

        // First visit: probe runs, then user cancels
        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'startFingerprintDetection' });
        await controller.handleMessage({ type: 'cancelFingerprintDetection' });

        // Re-enter view (render resets state) and confirm without probing
        await controller.render({ device: mockDevice, setupType: 'automatic' });
        await controller.handleMessage({ type: 'confirmDeviceType', deviceType: DeviceType.Z4 });

        // Only the last navigate (confirm) call matters for telemetry; cancel navigates too
        expect(navigateSpy).toHaveBeenCalledTimes(2);
        expect(mockTelemetry.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({
                detectedType: DeviceType.Pending,
                confirmedType: DeviceType.Z4,
                wasOverridden: 'true'
            })
        }));
    });
});

// ---------------------------------------------------------------------------
// handleMessage — cancelFingerprintDetection
// ---------------------------------------------------------------------------

describe('handleMessage — cancelFingerprintDetection', () => {
    it('should navigate back to AutomaticSetupViewController', async () => {
        const controller = createController();

        const navigateSpy = jest.spyOn(controller as any, 'navigateTo').mockResolvedValue(undefined);
        await controller.render({ device: mockDevice });
        await controller.handleMessage({ type: 'cancelFingerprintDetection' });

        expect(navigateSpy).toHaveBeenCalledWith(
            AutomaticSetupViewController.viewId(),
            { device: mockDevice }
        );
    });
});

// ---------------------------------------------------------------------------
// handleMessage — no current device
// ---------------------------------------------------------------------------

describe('handleMessage — no device set', () => {
    it('should log error and return early if handleMessage is called before render', async () => {
        const controller = createController();
        const sendMessageSpy = jest.spyOn(controller as any, 'sendMessageToWebview').mockReturnValue(undefined);

        await controller.handleMessage({ type: 'startFingerprintDetection' });

        expect(mockLogger.error).toHaveBeenCalledWith('No device available for message handling');
        expect(sendMessageSpy).not.toHaveBeenCalled();
        expect(mockDeviceFingerprintService.buildDeviceFingerprint).not.toHaveBeenCalled();
    });
});
