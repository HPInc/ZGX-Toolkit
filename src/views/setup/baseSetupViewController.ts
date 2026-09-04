/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { BaseViewController } from '../baseViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Device } from '../../types/devices';
import { ConnectionService } from '../../services/connectionService';

/**
 * Shared base for SSH setup views (automatic and manual).
 * Provides common SSH connectivity test logic used by both flows.
 */
export abstract class BaseSetupViewController extends BaseViewController {
    protected readonly connectionService: ConnectionService;

    constructor(deps: {
        logger: Logger;
        telemetry: ITelemetryService;
        connectionService: ConnectionService;
    }) {
        super(deps.logger, deps.telemetry);
        this.connectionService = deps.connectionService;
    }

    /**
     * Test SSH key connectivity to the device.
     * Returns true on success; sends a connectionTestFailed message to the webview and returns false on failure.
     *
     * @param device The device to test connectivity against
     * @param fallbackError User-facing error message when no specific error is available
     */
    protected async handleTestConnection(device: Device, fallbackError = 'Failed to verify SSH connection.'): Promise<boolean> {
        this.logger.info('Testing SSH connection', { device: device.name });

        try {
            const testSuccessful = await this.connectionService.testSSHKeyConnectivity(device);

            if (!testSuccessful) {
                throw new Error('SSH connection test failed - could not connect to device');
            }

            this.logger.info('SSH connection test successful', { device: device.name });
            return true;

        } catch (error) {
            this.logger.error('Connection test failed', {
                error: error instanceof Error ? error.message : String(error),
                device: device.name
            });

            this.sendMessageToWebview({
                type: 'connectionTestFailed',
                error: error instanceof Error ? error.message : fallbackError
            });
            return false;
        }
    }
}
