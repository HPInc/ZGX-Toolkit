/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { ZgxToolkitProvider } from './providers';
import { ViewFactory } from './views/viewFactory';
import { MessageRouter } from './utils/messageRouter';
import { logger } from './utils/logger';
import { telemetryService } from './services/telemetryService';
import { TelemetryEventType } from './types/telemetry';
import { configService } from './services/configService';
import { deviceStore, groupStore } from './store';
import { deviceService, AppInstallationService, PasswordService, deviceDiscoveryService, extensionStateService, dnsServiceRegistration, connectxGroupService, deviceHealthCheckService, deviceFingerprintService, DeviceService, migrateSettings } from './services';
import { ConfigurationSchemaNotRegisteredError } from './services/configMigrationService';
import { ConnectionService } from './services/connectionService';
import { registerCommands } from './commands';
import { createGlobalStatePersistenceService } from './services/globalStatePersistenceService';
import { DeviceType } from './types/devices';
import { GLOBAL_STATE_KEYS } from './constants/globalState';

let isActivated = false;
let provider: ZgxToolkitProvider | undefined;

const TYPES_THAT_TRIGGER_NOTIFICATION = new Set<DeviceType>([DeviceType.Unknown]);

/**
 * Checks the device store for devices that need a manually selected device type: **those without
 * a fingerprint device type** OR whose fingerprint type is `Unknown`. If any are found, shows a
 * one-time (per activation) notification prompting the user to manually set the device type via
 * the Edit Device form for a better setup, pairing, and discoverability experience.
 *
 * @param deviceServiceInstance Device service used to read the current device list
 * @param vscodeWindow VS Code window API used to display the notification
 */
export async function notifyDevicesWithUnknownType(
    deviceServiceInstance: DeviceService,
    vscodeWindow: typeof vscode.window
): Promise<void> {
    const devices = await deviceServiceInstance.getAllDevices();
    const devicesNeedingType = devices.filter(device => {
        const deviceType = device.fingerprint?.deviceType;
        return deviceType === undefined || TYPES_THAT_TRIGGER_NOTIFICATION.has(deviceType);
    });

    if (devicesNeedingType.length === 0) {
        return;
    }

    const message = 'Add device types to your devices - Device types help improve setup, pairing, and discoverability. '
        + 'Some of your existing devices may need a type defined. Click Edit on a device to update it to get the best experience.';

    await vscodeWindow.showInformationMessage(message, 'Dismiss');
}

/** Returns false when migration requests a window reload; returns true when migration succeeds or is skipped and activation should continue. */
async function runSettingsMigration(context: vscode.ExtensionContext): Promise<boolean> {
    try {
        await migrateSettings(context);
        return true;
    } catch (error) {
        if (error instanceof ConfigurationSchemaNotRegisteredError) {
            const reloadAttempts = context.globalState.get<number>(GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS) ?? 0;
            if (reloadAttempts < 2) {
                await context.globalState.update(GLOBAL_STATE_KEYS.MIGRATION_RELOAD_ATTEMPTS, reloadAttempts + 1);
                void vscode.commands.executeCommand('workbench.action.reloadWindow');
                return false;
            }
            logger.error('zToolkit schema not registered after max reload attempts; skipping migration and continuing extension activation');
        } else {
            logger.error('Settings migration failed but extension will continue', { error });
        }

        await context.globalState.update(GLOBAL_STATE_KEYS.SETTINGS_MIGRATED_V1, true); // mark migration as done to avoid repeated attempts
        vscode.window.showErrorMessage('Z Toolkit settings migration failed. Please check your user settings and update them manually if necessary.');
        return true;
    }
}

/**
 * Activate the Z Toolkit extension.
 * This is called when the extension is first loaded.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    if (isActivated) {
        logger.warn('Extension already activated, skipping');
        return;
    }
    isActivated = true;

    try {
        logger.info('Activating Z Toolkit extension');

        // Initialize extension state service
        extensionStateService.initialize(context);

        // Migrate legacy zgxToolkit.* settings to zToolkit.* before first config read
        const shouldContinueActivation = await runSettingsMigration(context);
        if (!shouldContinueActivation) {
            return;
        }

        // Initialize configuration
        const logLevel = configService.getLogLevel();
        logger.setLevel(logLevel);
        logger.debug('Log level initialized', { level: logLevel });

        // Initialize telemetry
        //
        // Note: We have our own telemetry setting. So both vscode's and ours need to be true to enable telemetry.
        //       Additionally, we need to listen for changes to vscode's setting, as the user can change it at runtime.
        const telemetryEnabled = vscode.env.isTelemetryEnabled && configService.getTelemetryEnabled();
        telemetryService.setEnabled(telemetryEnabled);
        vscode.env.onDidChangeTelemetryEnabled((enabled) => {
            telemetryService.setEnabled(enabled && configService.getTelemetryEnabled());
        });
        context.subscriptions.push({
            dispose: async () => await telemetryService.dispose()
        });
        logger.debug('Telemetry initialized', { enabled: telemetryEnabled });

        // Initialize connection service
        const connectionService = new ConnectionService();
        logger.debug('Connection service initialized');

        // Initialize app installation service
        const appInstallationService = new AppInstallationService();
        logger.debug('App installation service initialized');

        // Initialize password service
        const passwordService = new PasswordService();
        logger.debug('Password service initialized');

        // Create message router
        const messageRouter = new MessageRouter(logger);

        // Initialize global state persistence service (subscribes to store changes and persists them)
        const storageService = await createGlobalStatePersistenceService(context, deviceStore, groupStore);
        context.subscriptions.push({
            dispose: () => storageService.dispose()
        });
        logger.debug('Storage service initialized (devices and groups)');

        // Run DNS service migration for existing devices (backwards compatibility)
        // This runs asynchronously and doesn't block extension activation
        dnsServiceRegistration.migrateExistingDevices(deviceService, vscode.window).catch(error => {
            logger.error('mDNS migration failed but extension will continue', { error });
        });

        // Notify the user if any devices still have an unrecognized ('unknown') device type,
        // prompting them to set it manually via Edit Device. Runs once per activation and
        // doesn't block extension activation.
        notifyDevicesWithUnknownType(deviceService, vscode.window).catch(error => {
            logger.error('Failed to check for devices with unknown type', { error });
        });

        // Create view factory with dependencies
        const viewFactory = new ViewFactory(logger, telemetryService, {
            deviceService,
            deviceStore,
            groupStore,
            connectxGroupService,
            deviceHealthCheckService,
            configService,
            deviceDiscoveryService,
            connectionService,
            appInstallationService,
            passwordService,
            deviceFingerprintService
        });

        // Create and register unified provider
        provider = new ZgxToolkitProvider(
            context,
            viewFactory,
            messageRouter,
            logger
        );

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'remoteDevicesList',
                provider
            )
        );

        logger.debug('Z Toolkit provider registered');

        // Register all commands
        registerCommands(context, provider);

        // Start background updater for device discovery (non-blocking)
        deviceService.startBackgroundUpdater()
            .then(() => {
                logger.debug('Background device updater started');
            })
            .catch(error => {
                logger.error('Failed to start background device updater', { error });
            });

        // Track activation
        if (extensionStateService.isFirstRun()) {
            logger.info('First run of the extension detected');
            telemetryService.trackEvent({
                eventType: TelemetryEventType.Extension,
                action: 'firstActivation',
                properties: {
                    version: context.extension.packageJSON.version
                }
            });
            // Mark that the extension has run before
            await extensionStateService.setFirstRun(true);
        } else {
            telemetryService.trackEvent({
                eventType: TelemetryEventType.Extension,
                action: 'activate',
                properties: {
                    version: context.extension.packageJSON.version
                }
            });
        }

        logger.info('Z Toolkit extension activated successfully');
    } catch (error) {
        logger.error('Extension activation failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        vscode.window.showErrorMessage(
            `Failed to activate Z Toolkit: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
    }
}

/**
 * Deactivate the extension.
 * This is called when the extension is being unloaded.
 */
export function deactivate(): void {
    logger.info('Deactivating Z Toolkit extension');

    // Stop background updater
    deviceService.stopBackgroundUpdater();
    logger.debug('Background device updater stopped');

    // Cleanup provider
    if (provider) {
        provider.dispose();
        provider = undefined;
    }

    logger.info('Z Toolkit extension deactivated');
}

/**
 * Reset activation state (for testing purposes only).
 */
export function resetActivationState(): void {
    isActivated = false;
    provider = undefined;
}