/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../../baseViewController';
import { Logger } from '../../../utils/logger';
import { ITelemetryService, TelemetryEventType, DeviceTypeDetectionEvent } from '../../../types/telemetry';
import { Device, DeviceType, getDeviceTypeLabel, getDeviceTypeOptions } from '../../../types/devices';
import { Message } from '../../../types/messages';
import { DeviceFingerprintService } from '../../../services/deviceFingerprintService';
import { DeviceService } from '../../../services/deviceService';
import { DnsRegistrationViewController } from '../dnsRegistration/dnsRegistrationViewController';
import { SETUP_VIEW_IDS } from '../setupViewIds';

/**
 * Detect Device Type view - runs device type probe and allows user to confirm or override.
 * Sits between successful SSH connection test and mDNS registration in the automatic setup flow.
 */
export class DetectDeviceTypeViewController extends BaseViewController {
    private readonly deviceFingerprintService: DeviceFingerprintService;
    private readonly deviceService: DeviceService;
    private currentDevice?: Device;
    private lastDetectedType?: DeviceType;
    // 'automatic' and 'manual' both route through this view before DNS registration.
    // 'migration' goes directly to DnsRegistrationViewController and will never arrive here.
    private setupType?: 'automatic' | 'manual';

    public static viewId(): string {
        return SETUP_VIEW_IDS.detectDeviceType;
    }

    constructor(
        deps: {
            logger: Logger;
            telemetry: ITelemetryService;
            deviceFingerprintService: DeviceFingerprintService;
            deviceService: DeviceService;
        }
    ) {
        super(deps.logger, deps.telemetry);
        this.deviceFingerprintService = deps.deviceFingerprintService;
        this.deviceService = deps.deviceService;
        this.template = this.loadTemplate('setup/detectDeviceType/detectDeviceType.html');
        this.styles = this.loadTemplate('setup/detectDeviceType/detectDeviceType.css');
        this.clientScript = this.loadTemplate('setup/detectDeviceType/detectDeviceType.js');
    }

    async render(
        params?: { device: Device; setupType?: 'automatic' | 'manual' },
        nonce?: string
    ): Promise<string> {
        this.logger.debug('Rendering detect device type view', { device: params?.device?.name });

        if (!params?.device) {
            this.logger.error('No device provided to detect device type view');
            throw new Error('device required for detect device type view');
        }

        this.currentDevice = params.device;
        this.lastDetectedType = undefined;
        this.setupType = params.setupType;

        const html = this.renderTemplate(this.template, {
            deviceName: params.device.name,
            deviceTypeOptions: getDeviceTypeOptions()
        });

        this.telemetry.trackEvent({
            eventType: TelemetryEventType.View,
            action: 'navigate',
            properties: {
                toView: 'setup.detectDeviceType'
            }
        });

        return this.wrapHtml(html, nonce);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);

        this.logger.trace('Detect device type view handling message', { type: message.type });

        if (!this.currentDevice) {
            this.logger.error('No device available for message handling');
            return;
        }

        // SETUP_VIEW_IDS is imported directly (rather than via ManualSetupViewController.viewId())
        // to avoid a circular dependency: ManualSetupViewController already imports this controller.
        switch (message.type) {
            case 'startFingerprintDetection':
                await this.handleDetection(this.currentDevice);
                break;

            case 'confirmDeviceType':
                await this.handleConfirmDeviceType(this.currentDevice, message.deviceType);
                break;

            case 'cancelFingerprintDetection': {
                const targetViewId = this.setupType === 'manual'
                    ? SETUP_VIEW_IDS.manual
                    : SETUP_VIEW_IDS.automatic;
                this.lastDetectedType = undefined;
                await this.navigateTo(targetViewId, { device: this.currentDevice });

                break;
            }


            default:
                this.logger.debug('Unhandled message type in detect device type view', { type: message.type });
        }
    }

    /**
     * Run the device type probe and send the result back to the webview.
     * On any probe failure the view falls back to edit mode (graceful degradation).
     */
    private async handleDetection(device: Device): Promise<void> {
        this.logger.info('Starting device type detection', { device: device.name });

        try {
            const fingerprint = await this.deviceFingerprintService.buildDeviceFingerprint(device);
            this.lastDetectedType = fingerprint.deviceType;
            const displayName = getDeviceTypeLabel(fingerprint.deviceType);
            const requiresSelection = !fingerprint.deviceType ||
                fingerprint.deviceType === DeviceType.Pending ||
                fingerprint.deviceType === DeviceType.Unknown ||
                fingerprint.deviceType === DeviceType.Other;
            let detectedLabel: string | null = null;
            if (requiresSelection) {
                detectedLabel = fingerprint.deviceType === DeviceType.Other ? 'Other' : 'Device unknown';
            }

            this.logger.info('Device type detection complete', {
                device: device.name,
                deviceType: fingerprint.deviceType,
                displayName,
                requiresSelection
            });

            this.sendMessageToWebview({
                type: 'fingerprintResult',
                deviceType: fingerprint.deviceType ?? null,
                displayName,
                requiresSelection,
                detectedLabel
            });
        } catch (error) {
            this.lastDetectedType = undefined;
            this.logger.error('Device type detection failed', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });

            // Graceful fallback: drop user into edit mode
            this.sendMessageToWebview({
                type: 'fingerprintResult',
                deviceType: null,
                displayName: null,
                requiresSelection: true,
                detectedLabel: 'Device unknown'
            });
        }
    }

    /**
     * Persist the confirmed or user-overridden device type and proceed to DNS registration.
     * A persistence failure is logged but does not block the user from continuing.
     */
    private async handleConfirmDeviceType(device: Device, deviceType: string): Promise<void> {
        this.logger.info('Confirming device type', { device: device.name, deviceType });

        const allowedTypes = new Set(getDeviceTypeOptions().map(option => option.value));
        if (!allowedTypes.has(deviceType as DeviceType)) {
            this.logger.warn('Invalid device type received from webview', { device: device.name, deviceType });
            this.sendMessageToWebview({
                type: 'fingerprintResult',
                deviceType: null,
                displayName: null,
                requiresSelection: true,
                detectedLabel: 'Device unknown'
            });
            return;
        }

        const resolvedType = deviceType as DeviceType;
        const updatedFingerprint = this.deviceFingerprintService.updateDeviceFingerprint(
            device.fingerprint,
            { deviceType: resolvedType }
        );

        try {
            await this.deviceService.updateDevice(device.id, { fingerprint: updatedFingerprint });
        } catch (error) {
            // Do not block the setup flow on persistence failure
            this.logger.error('Failed to persist device type', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });
        }

        const updatedDevice: Device = { ...device, fingerprint: updatedFingerprint };

        const detectedType = this.lastDetectedType ?? device.fingerprint?.deviceType ?? DeviceType.Pending;
        const detectionEvent: DeviceTypeDetectionEvent = {
            eventType: TelemetryEventType.DeviceTypeDetection,
            action: 'confirmed',
            properties: {
                detectedType,
                confirmedType: resolvedType,
                wasOverridden: detectedType === resolvedType ? 'false' : 'true',
                setupType: this.setupType ?? 'unknown'
            }
        };
        this.telemetry.trackEvent(detectionEvent);

        // setupType is forwarded so DnsRegistrationViewController can decide where to navigate next (automatic vs manual flow)
        await this.navigateTo(
            DnsRegistrationViewController.viewId(),
            { device: updatedDevice, setupType: this.setupType },
            'editor'
        );
    }
}
