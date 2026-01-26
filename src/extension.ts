/*
 * Copyright ©2025 HP Development Company, L.P.
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
import { deviceStore } from './store';
import { deviceService, AppInstallationService, PasswordService, deviceDiscoveryService, extensionStateService, dnsServiceRegistration } from './services';
import { ConnectionService } from './services/connectionService';
import { registerCommands, setCommandContext } from './commands';
import { createGlobalStatePersistenceService } from './services/globalStatePersistenceService';

let isActivated = false;
let provider: ZgxToolkitProvider | undefined;

/**
 * Activate the ZGX Toolkit extension.
 * This is called when the extension is first loaded.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    if (isActivated) {
        logger.warn('Extension already activated, skipping');
        return;
    }
    isActivated = true;

    try {
        logger.info('Activating ZGX Toolkit extension');

        // Initialize extension state service
        extensionStateService.initialize(context);

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
        const storageService = await createGlobalStatePersistenceService(context, deviceStore);
        context.subscriptions.push({
            dispose: () => storageService.dispose()
        });
        logger.debug('Storage service initialized');

        // Run DNS service migration for existing devices (backwards compatibility)
        // This runs asynchronously and doesn't block extension activation
        dnsServiceRegistration.migrateExistingDevices(deviceService, vscode.window).catch(error => {
            logger.error('mDNS migration failed but extension will continue', { error });
        });

        // Create view factory with dependencies
        const viewFactory = new ViewFactory(logger, telemetryService, {
            deviceService,
            deviceStore,
            configService,
            deviceDiscoveryService,
            connectionService,
            appInstallationService,
            passwordService
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

        logger.debug('ZGX Toolkit provider registered');

        // Register all commands
        setCommandContext(context);
        registerCommands(context);

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
                    version: context.extension.packageJSON.version,
                }
            });
            // Mark that the extension has run before
            await extensionStateService.setFirstRun(true);
        } else {
            telemetryService.trackEvent({
                eventType: TelemetryEventType.Extension,
                action: 'activate',
                properties: {
                    version: context.extension.packageJSON.version,
                }
            });
        }

        logger.info('ZGX Toolkit extension activated successfully');
    } catch (error) {
        logger.error('Extension activation failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        vscode.window.showErrorMessage(
            `Failed to activate ZGX Toolkit: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
    }
}

/**
 * Deactivate the extension.
 * This is called when the extension is being unloaded.
 */
export function deactivate(): void {
    logger.info('Deactivating ZGX Toolkit extension');

    // Stop background updater
    deviceService.stopBackgroundUpdater();
    logger.debug('Background device updater stopped');

    // Cleanup provider
    if (provider) {
        provider.dispose();
        provider = undefined;
    }

    logger.info('ZGX Toolkit extension deactivated');
}

/**
 * Reset activation state (for testing purposes only).
 */
export function resetActivationState(): void {
    isActivated = false;
    provider = undefined;
}