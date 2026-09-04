/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Probe that detects device type from DMI product name.
 */

import { Device, DeviceFingerprint, DeviceType } from '../../types/devices';
import { logger } from '../../utils/logger';
import { executeSSHCommand } from '../../utils/sshConnection';
import { FingerprintProbe } from './fingerprintProbe';

/**
 * Known signature used to infer a DeviceType from fingerprint data.
 */
export interface DeviceTypeSignature {
    /** Case-insensitive substring expected in transient product name input */
    productNameContains: string;
    /** Device type mapped from this signature */
    deviceType: DeviceType;
}

/**
 * Registry of known device type signatures.
 * Matching is case-insensitive substring matching.
 */
const KNOWN_DEVICE_TYPE_SIGNATURES: DeviceTypeSignature[] = [
    {
        productNameContains: 'HP ZGX Fury',
        deviceType: DeviceType.ZGXFury
    },
    {
        productNameContains: 'HP ZGX Nano',
        deviceType: DeviceType.ZGXNano
    },
    {
        productNameContains: 'HP Z6',
        deviceType: DeviceType.Z6
    },
    {
        productNameContains: 'HP Z4',
        deviceType: DeviceType.Z4
    },
    {
        productNameContains: 'HP Z2',
        deviceType: DeviceType.Z2
    },
    {
        productNameContains: 'HP Z8',
        deviceType: DeviceType.Z8
    }
];

/**
 * Probe that reads /sys/class/dmi/id/product_name and detects device type.
 */
export class DeviceTypeProbe implements FingerprintProbe {
    readonly probeName = 'deviceType';

    /**
     * Read /sys/class/dmi/id/product_name from the remote device.
     *
     * @param device The remote device
     * @returns Trimmed product name string
     */
    private async readProductName(device: Device): Promise<string> {
        logger.debug('Reading DMI product name from sysfs', { device: device.name });

        const result = await executeSSHCommand(
            device,
            'cat /sys/class/dmi/id/product_name',
            {},
            {
                operationName: 'read product_name file',
                timeoutSeconds: 10
            }
        );

        if (!result.success) {
            throw new Error(
                `Failed to read /sys/class/dmi/id/product_name (file may be missing or unreadable): ${result.stderr || result.stdout}`
            );
        }

        const productName = result.stdout.trim();
        if (!productName) {
            logger.warn('product_name file output was empty; treating as unmapped device type');
        }

        logger.debug('product_name file output received', {
            device: device.name,
            productName
        });

        return productName;
    }

    /**
     * Resolve DeviceType from transient product name data.
     *
     * @param productName Raw product name read from sysfs
     * @returns Resolved DeviceType based on known signatures
     */
    private resolveDeviceTypeFromProductName(productName: string): DeviceType {
        const normalizedInput = productName.trim();
        if (!normalizedInput) {
            logger.warn('Product name missing, defaulting to Other');
            return DeviceType.Other;
        }

        const normalizedProductName = normalizedInput.toLowerCase();

        for (const signature of KNOWN_DEVICE_TYPE_SIGNATURES) {
            if (normalizedProductName.includes(signature.productNameContains.toLowerCase())) {
                logger.info('Device signature matched', {
                    deviceType: signature.deviceType,
                    productName: normalizedInput
                });
                return signature.deviceType;
            }
        }

        logger.warn('No signature matched for product_name file, defaulting to Other', { productName: normalizedInput });
        return DeviceType.Other;
    }

    /**
     * Execute the device type probe.
     * Reads product name and resolves device type.
     * Returns `{ deviceType: DeviceType.Unknown }` on failure (graceful degradation).
     * Unmatched product names are mapped to DeviceType.Other.
     *
     * @param device The remote device
     * @returns Partial fingerprint with deviceType, or Unknown if probe fails
     */
    async execute(device: Device): Promise<Partial<DeviceFingerprint>> {
        try {
            const productName = await this.readProductName(device);
            const deviceType = this.resolveDeviceTypeFromProductName(productName);
            return { deviceType };
        } catch (error) {
            logger.error('DeviceTypeProbe failed, returning DeviceType.Unknown', {
                device: device.name,
                error: error instanceof Error ? error.message : String(error)
            });
            return { deviceType: DeviceType.Unknown };
        }
    }
}
