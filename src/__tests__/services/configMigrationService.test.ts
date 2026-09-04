/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { ConfigurationSchemaNotRegisteredError, migrateSettings } from '../../services/configMigrationService';
import { GLOBAL_STATE_KEYS } from '../../constants/globalState';

jest.mock('vscode');

describe('migrateSettings', () => {
    let mockContext: vscode.ExtensionContext;
    let mockLegacyConfig: { inspect: jest.Mock; update: jest.Mock };
    let mockNewConfig: { inspect: jest.Mock; update: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockLegacyConfig = { inspect: jest.fn().mockReturnValue({}), update: jest.fn().mockResolvedValue(undefined) };
        mockNewConfig = {
            inspect: jest.fn().mockImplementation((key: string) => {
                if (key === 'logLevel') {
                    return { defaultValue: 'Info' };
                }
                if (key === 'telemetry.enabled') {
                    return { defaultValue: true };
                }
                return {};
            }),
            update: jest.fn().mockResolvedValue(undefined)
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
            if (section === 'zgxToolkit') { return mockLegacyConfig; }
            if (section === 'zToolkit') { return mockNewConfig; }
            return { inspect: jest.fn().mockReturnValue({}), update: jest.fn() };
        });

        mockContext = {
            globalState: {
                get: jest.fn().mockReturnValue(false),
                update: jest.fn().mockResolvedValue(undefined)
            }
        } as any;
    });

    it('skips migration when already flagged in globalState', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue(true);

        await migrateSettings(mockContext);

        expect(mockLegacyConfig.inspect).not.toHaveBeenCalled();
        expect(mockNewConfig.update).not.toHaveBeenCalled();
    });

    it('copies globalValue for each key and clears the old key', async () => {
        mockLegacyConfig.inspect.mockImplementation((key: string) => {
            if (key === 'logLevel') { return { globalValue: 'Debug' }; }
            return {};
        });

        await migrateSettings(mockContext);

        expect(mockNewConfig.update).toHaveBeenCalledWith('logLevel', 'Debug', vscode.ConfigurationTarget.Global);
        expect(mockLegacyConfig.update).toHaveBeenCalledWith('logLevel', undefined, vscode.ConfigurationTarget.Global);
    });

    it('copies workspaceValue for each key and clears the old key', async () => {
        mockLegacyConfig.inspect.mockImplementation((key: string) => {
            if (key === 'telemetry.enabled') { return { workspaceValue: false }; }
            return {};
        });

        await migrateSettings(mockContext);

        expect(mockNewConfig.update).toHaveBeenCalledWith('telemetry.enabled', false, vscode.ConfigurationTarget.Workspace);
        expect(mockLegacyConfig.update).toHaveBeenCalledWith('telemetry.enabled', undefined, vscode.ConfigurationTarget.Workspace);
    });

    it('is a no-op when no old settings are explicitly set', async () => {
        // inspect returns {} (no globalValue or workspaceValue)
        await migrateSettings(mockContext);

        expect(mockNewConfig.update).not.toHaveBeenCalled();
        expect(mockLegacyConfig.update).not.toHaveBeenCalled();
    });

    it('sets the migration flag in globalState after running', async () => {
        await migrateSettings(mockContext);

        expect(mockContext.globalState.update).toHaveBeenCalledWith(
            GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1,
            true
        );
    });

    it('does not set the flag when migration is skipped due to flag already being set', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue(true);

        await migrateSettings(mockContext);

        expect(mockContext.globalState.update).not.toHaveBeenCalled();
    });

    it('throws when new schema is not registered and does not set migration flag', async () => {
        mockNewConfig.inspect.mockReturnValue({});

        await expect(migrateSettings(mockContext)).rejects.toBeInstanceOf(ConfigurationSchemaNotRegisteredError);
        expect(mockContext.globalState.update).not.toHaveBeenCalled();
    });
});
