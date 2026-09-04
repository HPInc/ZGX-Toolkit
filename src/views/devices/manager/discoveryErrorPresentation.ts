/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceDiscoveryError, DeviceDiscoveryFailureReason, classifyDeviceDiscoveryFailureReason } from '../../../services/deviceDiscoveryService';

export interface DiscoveryErrorPresentation {
    title: string;
    code: string;
}

const DEFAULT_DISCOVERY_ERROR_PRESENTATION: DiscoveryErrorPresentation = {
    title: 'Discovery failed.',
    code: 'ZTK-DISCO-UNKNOWN'
};

export const NO_DEVICES_DISCOVERY_PRESENTATION: DiscoveryErrorPresentation = {
    title: 'No devices found.',
    code: 'ZTK-DISCO-NO-DEVICES'
};

const DISCOVERY_ERROR_PRESENTATIONS: Record<DeviceDiscoveryFailureReason, DiscoveryErrorPresentation> = {
    timeout: {
        title: 'Discovery timed out.',
        code: 'ZTK-DISCO-TIMEOUT'
    },
    permission: {
        title: 'Device discovery needs network access.',
        code: 'ZTK-DISCO-PERMISSION'
    },
    service: {
        title: 'The discovery service is unavailable.',
        code: 'ZTK-DISCO-SERVICE'
    },
    network: {
        title: 'Network discovery is unavailable.',
        code: 'ZTK-DISCO-NETWORK'
    },
    unknown: DEFAULT_DISCOVERY_ERROR_PRESENTATION
};

function normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return '';
}

export function getDiscoveryErrorPresentation(error: unknown): DiscoveryErrorPresentation {
    if (error instanceof DeviceDiscoveryError) {
        return DISCOVERY_ERROR_PRESENTATIONS[error.reason];
    }

    const message = normalizeErrorMessage(error);
    if (!message) {
        return DEFAULT_DISCOVERY_ERROR_PRESENTATION;
    }

    const reason = classifyDeviceDiscoveryFailureReason(message);

    return DISCOVERY_ERROR_PRESENTATIONS[reason];
}