/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for the services barrel export.
 * Touches every re-exported symbol to ensure the barrel module is fully covered.
 */

import * as services from '../../services';

describe('services barrel export', () => {
    it('re-exports every service class and singleton', () => {
        expect(services.ConfigService).toBeDefined();
        expect(services.configService).toBeDefined();
        expect(services.DeviceService).toBeDefined();
        expect(services.deviceService).toBeDefined();
        expect(services.DeviceDiscoveryService).toBeDefined();
        expect(services.deviceDiscoveryService).toBeDefined();
        expect(services.TelemetryService).toBeDefined();
        expect(services.telemetryService).toBeDefined();
        expect(services.ConnectionService).toBeDefined();
        expect(services.connectionService).toBeDefined();
        expect(services.AppInstallationService).toBeDefined();
        expect(services.InstallationErrorType).toBeDefined();
        expect(services.PasswordService).toBeDefined();
        expect(services.ExtensionStateService).toBeDefined();
        expect(services.extensionStateService).toBeDefined();
        expect(services.DNSServiceRegistration).toBeDefined();
        expect(services.dnsServiceRegistration).toBeDefined();
        expect(services.ConnectXGroupService).toBeDefined();
        expect(services.connectxGroupService).toBeDefined();
        expect(services.DeviceHealthCheckService).toBeDefined();
        expect(services.deviceHealthCheckService).toBeDefined();
        expect(services.DeviceFingerprintService).toBeDefined();
        expect(services.deviceFingerprintService).toBeDefined();
        expect(services.migrateSettings).toBeDefined();
    });
});
