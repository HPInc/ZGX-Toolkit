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
import { deviceStore, groupStore, connectionStateStore, deviceReachabilityStore } from './store';
import { deviceService, AppInstallationService, PasswordService, deviceDiscoveryService, extensionStateService, dnsServiceRegistration, connectxGroupService, deviceHealthCheckService, deviceFingerprintService, DeviceService, migrateSettings, remoteSessionRegistryService } from './services';
import { ConfigurationSchemaNotRegisteredError } from './services/configMigrationService';
import { ConnectionService } from './services/connectionService';
import { registerCommands } from './commands';
import { createGlobalStatePersistenceService } from './services/globalStatePersistenceService';
import { DeviceType, Device } from './types/devices';
import { DeviceStatus } from './types/devicestatus';
import { ActiveSessionEntry } from './types/remoteSession';
import { GLOBAL_STATE_KEYS } from './constants/globalState';
import { REMOTE_SESSION_HEARTBEAT_INTERVAL_MS } from './constants/time';
import { CONFIG_KEYS } from './constants/config';
import { extractConnectLabelFromRemoteAuthority, findDeviceByConnectLabel } from './utils/remoteConnectLabel';
import { deviceReachabilityCheckService } from './services/deviceReachabilityCheckService';

let isActivated = false;
let provider: ZgxToolkitProvider | undefined;
let activeRemoteSessionDeviceId: string | undefined;
let activeRemoteSessionRegistration: ActiveRemoteSessionRegistration | undefined;
let activeRemoteSessionAuthority: string | undefined;

const TYPES_THAT_TRIGGER_NOTIFICATION = new Set<DeviceType>([DeviceType.Unknown]);

interface ActiveRemoteSessionRegistration extends vscode.Disposable {
    unregister(): Promise<void>;
}

function isCanceledNotificationError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'Canceled' || error.name === 'CancellationError');
}

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

function notifyDeviceConnectedInDedicatedWindow(device: { id: string; name: string }): void {
    void (async () => {
        const selection = await vscode.window.showInformationMessage(
            `Connected to ${device.name} in dedicated window.`,
            'Dismiss',
            'Disconnect'
        );

        if (selection !== 'Disconnect') {
            return;
        }

        await remoteSessionRegistryService.unregister(device.id, vscode.env.sessionId).catch(error =>
            logger.error('Failed to unregister active remote session on dedicated window disconnect', { error, deviceId: device.id })
        );

        try {
            await vscode.commands.executeCommand('workbench.action.remote.close');
        } catch (error) {
            logger.error('Failed to close remote connection', { error, deviceId: device.id });
            vscode.window.showErrorMessage('Could not close the remote connection automatically. Please close this window manually.');
        }
    })().catch(error => {
        if (!isCanceledNotificationError(error)) {
            logger.error('Failed to process dedicated window connection notification', { error, deviceId: device.id });
        }
    });
}

/**
 * If this window is connected to a device via Remote-SSH, register it in the shared active
 * session registry (backed by active-sessions.json) and keep its heartbeat alive for the
 * lifetime of the window, so other windows can be notified without polling.
 */
function registerActiveRemoteSessionIfApplicable(context: vscode.ExtensionContext): void {
    const disposeRegistration = () => {
        activeRemoteSessionRegistration?.dispose();
        activeRemoteSessionRegistration = undefined;
        activeRemoteSessionAuthority = undefined;
    };

    const refreshRegistration = () => {
        const remoteAuthority = vscode.env.remoteName === 'ssh-remote'
            ? vscode.workspace.workspaceFolders?.[0]?.uri.authority
            : undefined;

        if (remoteAuthority === activeRemoteSessionAuthority) {
            return;
        }

        disposeRegistration();

        if (vscode.env.remoteName !== 'ssh-remote') {
            return;
        }

        const registration = tryRegisterActiveRemoteSession(remoteAuthority);
        if (!registration) {
            return;
        }

        activeRemoteSessionRegistration = registration;
        activeRemoteSessionAuthority = remoteAuthority;
    };

    refreshRegistration();

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(refreshRegistration),
        {
            dispose: disposeRegistration
        }
    );
}

/**
 * Attempt to resolve this window's connected device from its workspace folder authority and,
 * if found, register it (and start its heartbeat) in the shared active session registry.
 *
 * @returns a disposable registration when a matching device is found
 */
function tryRegisterActiveRemoteSession(remoteAuthority: string | undefined): ActiveRemoteSessionRegistration | undefined {
    const connectLabel = extractConnectLabelFromRemoteAuthority(remoteAuthority);
    if (!connectLabel) {
        return undefined;
    }

    const device = findDeviceByConnectLabel(deviceStore.getAll(), connectLabel);
    if (!device) {
        logger.debug('Connected via Remote-SSH but no matching device found for connect label', { connectLabel });
        return undefined;
    }

    activeRemoteSessionDeviceId = device.id;

    void vscode.commands.executeCommand('workbench.view.extension.zgx-toolkit').then(
        undefined,
        (error: unknown) => logger.error('Failed to reveal Z Toolkit view in connected window', { error, deviceId: device.id })
    );

    let isDisconnecting = false;
    let isCheckingDisconnectRequest = false;
    const disconnectIfRequested = async (): Promise<void> => {
        if (isDisconnecting || isCheckingDisconnectRequest) {
            return;
        }

        isCheckingDisconnectRequest = true;
        try {
            const disconnectRequested = await remoteSessionRegistryService.consumeDisconnectRequest(
                device.id,
                vscode.env.sessionId
            );
            if (!disconnectRequested) {
                return;
            }

            isDisconnecting = true;
            logger.info('Disconnecting active remote session requested by another window', { deviceId: device.id });
            await remoteSessionRegistryService.unregister(device.id, vscode.env.sessionId).catch(error =>
                logger.error('Failed to unregister active remote session after disconnect request', { error, deviceId: device.id })
            );

            // Re-check reachability now that the session is gone, so the status reflects reality.
            await deviceReachabilityCheckService.checkDevicesReachability([device]).catch(error =>
                logger.error('Failed to refresh device reachability after disconnect request', { error, deviceId: device.id })
            );

            try {
                await vscode.commands.executeCommand('workbench.action.remote.close');
            } catch (error) {
                logger.error('Failed to close remote connection after disconnect request', { error, deviceId: device.id });
                vscode.window.showErrorMessage('Could not close the remote connection automatically. Please close this window manually.');
            }
        } catch (error) {
            logger.error('Failed to check for a remote session disconnect request', { error, deviceId: device.id });
        } finally {
            isCheckingDisconnectRequest = false;
        }
    };

    const remoteSessionChangeSubscription = remoteSessionRegistryService.onDidChange(() => {
        void disconnectIfRequested();
    });

    let unregisterPromise: Promise<void> | undefined;
    const unregister = (): Promise<void> => {
        unregisterPromise ??= remoteSessionRegistryService.unregister(device.id, vscode.env.sessionId)
            .catch(error => {
                unregisterPromise = undefined;
                throw error;
            });
        return unregisterPromise;
    };

    remoteSessionRegistryService.register({ deviceId: device.id, connectLabel, windowId: vscode.env.sessionId })
        .then(() => notifyDeviceConnectedInDedicatedWindow(device))
        .catch(error => logger.error('Failed to register active remote session', { error, deviceId: device.id }));

    const heartbeatHandle = setInterval(() => {
        remoteSessionRegistryService.heartbeat(device.id, vscode.env.sessionId)
            .then(disconnectIfRequested)
            .catch(error => logger.error('Failed to refresh remote session heartbeat', { error, deviceId: device.id }));
    }, REMOTE_SESSION_HEARTBEAT_INTERVAL_MS);

    logger.info('Registered active remote session', { deviceId: device.id, connectLabel });
    return {
        dispose: () => {
            remoteSessionChangeSubscription.dispose();
            clearInterval(heartbeatHandle);
            activeRemoteSessionDeviceId = undefined;
            void unregister().catch(error =>
                logger.error('Failed to unregister active remote session', { error, deviceId: device.id })
            );
        },
        unregister
    };
}

/**
 * Keep the connection state store in sync with the shared active session registry: seed it
 * with the current snapshot, then reconcile it (pruning stale entries) whenever the registry
 * changes. Also reconciles on a timer, since a window that disappears without unregistering
 * (e.g. crashed, or closed before its dispose ran) won't trigger any further file-change
 * events - without a timer, the store would keep showing it as "connected" indefinitely
 * instead of pruning it once its heartbeat goes stale.
 */
function subscribeConnectionStateStore(context: vscode.ExtensionContext): void {
    const handleReconciliation = (entries: ActiveSessionEntry[]): void => {
        const { disconnectedDeviceIds, staleDeviceIds } = connectionStateStore.reconcile(entries);
        const staleDeviceIdSet = new Set(staleDeviceIds);
        // Single notify for all stale devices instead of one per device.
        deviceReachabilityStore.setManyResults(staleDeviceIds.map(deviceId => ({
            deviceId,
            status: DeviceStatus.CheckStatus,
            error: 'Connection session became stale'
        })));

        const devicesToRecheck = disconnectedDeviceIds
            .filter(id => !staleDeviceIdSet.has(id))
            .map(id => deviceStore.get(id))
            .filter((device): device is Device => !!device);

        if (devicesToRecheck.length > 0) {
            deviceReachabilityCheckService.checkDevicesReachability(devicesToRecheck).catch(error =>
                logger.error('Failed to refresh device reachability after observing a disconnect', {
                    error,
                    deviceIds: devicesToRecheck.map(device => device.id)
                })
            );
        }
    };

    const reconcileFromRegistry = () => {
        remoteSessionRegistryService.readAll()
            .then(handleReconciliation)
            .catch(error => logger.error('Failed to reconcile connection state store from registry', { error }));
    };

    context.subscriptions.push(
        remoteSessionRegistryService.onDidChange(handleReconciliation)
    );

    const reconcileInterval = setInterval(reconcileFromRegistry, REMOTE_SESSION_HEARTBEAT_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(reconcileInterval) });

    reconcileFromRegistry();
}

function startDeviceReachabilityUpdater(context: vscode.ExtensionContext): void {
    let checkInProgress = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const checkDevices = async (): Promise<void> => {
        if (checkInProgress) {
            return;
        }

        checkInProgress = true;
        try {
            await deviceReachabilityCheckService.checkDevicesReachability(deviceStore.getAll());
        } catch (error) {
            logger.error('Background device reachability check failed', { error });
        } finally {
            checkInProgress = false;
        }
    };

    const startInterval = (): void => {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
        if (!configService.getReachabilityEnabled()) {
            return;
        }
        interval = setInterval(() => {
            void checkDevices();
        }, configService.getReachabilityRefreshIntervalMs());
    };

    if (configService.getReachabilityEnabled()) {
        void checkDevices();
    }
    startInterval();

    const configListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(CONFIG_KEYS.REACHABILITY_REFRESH_INTERVAL)
            || event.affectsConfiguration(CONFIG_KEYS.REACHABILITY_ENABLED)) {
            logger.debug('Device reachability refresh settings changed, restarting timer', {
                enabled: configService.getReachabilityEnabled(),
                intervalMs: configService.getReachabilityRefreshIntervalMs()
            });
            startInterval();
        }
    });

    context.subscriptions.push(configListener, {
        dispose: () => {
            if (interval) {
                clearInterval(interval);
            }
        }
    });
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
        const storageService = await createGlobalStatePersistenceService(
            context,
            deviceStore,
            groupStore,
            deviceReachabilityStore
        );
        context.subscriptions.push({
            dispose: () => storageService.dispose()
        });
        logger.debug('Storage service initialized (devices and groups)');

        // Keep derived connection state in sync with the shared active session registry
        subscribeConnectionStateStore(context);
        startDeviceReachabilityUpdater(context);

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

        // The provider must be registered before the connected Remote-SSH window reveals its
        // Z Toolkit view container.
        registerActiveRemoteSessionIfApplicable(context);

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
 *
 * Returns a promise so VS Code awaits it before killing the extension host: the
 * context.subscriptions disposable also unregisters the active remote session, but its
 * dispose() is fire-and-forget, so this is what actually guarantees active-sessions.json
 * is updated (matching the manual "Disconnect" button flow) before the process exits.
 */
export async function deactivate(): Promise<void> {
    logger.info('Deactivating Z Toolkit extension');

    // Stop background updater
    deviceService.stopBackgroundUpdater();
    logger.debug('Background device updater stopped');

    const activeSessionRegistration = activeRemoteSessionRegistration;
    const activeSessionDeviceId = activeRemoteSessionDeviceId;
    activeSessionRegistration?.dispose();
    activeRemoteSessionRegistration = undefined;
    activeRemoteSessionAuthority = undefined;

    // Unregister this window's active remote session, if any
    if (activeSessionRegistration || activeSessionDeviceId) {
        try {
            if (activeSessionRegistration) {
                await activeSessionRegistration.unregister();
            } else if (activeSessionDeviceId) {
                await remoteSessionRegistryService.unregister(activeSessionDeviceId, vscode.env.sessionId);
            }
        } catch (error) {
            logger.error('Failed to unregister active remote session during deactivation', { error });
        }
        activeRemoteSessionDeviceId = undefined;
    }

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
    activeRemoteSessionDeviceId = undefined;
    activeRemoteSessionRegistration = undefined;
    activeRemoteSessionAuthority = undefined;
}