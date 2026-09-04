/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Command handlers for the Z Toolkit extension.
 * Implements all commands registered in package.json.
 */

import * as vscode from 'vscode';
import { Logger, logger } from '../utils/logger';
import { telemetryService } from '../services/telemetryService';
import { configService } from '../services/configService';
import { connectxGroupService } from '../services/connectxGroupService';
import { COMMANDS } from '../constants/commands';
import { LOG_LEVEL_OPTIONS, parseLogLevel } from '../constants/logLevels';
import { TelemetryEventType } from '../types/telemetry';
import { ZgxToolkitProvider } from '../providers';

/**
 * Register all extension commands.
 * This should be called during extension activation.
 * 
 * @param context Extension context for registering disposables
 * @param zgxProvider The Z Toolkit provider for view navigation
 */
export function registerCommands(context: vscode.ExtensionContext, zgxProvider: ZgxToolkitProvider): void {

    logger.debug('Registering extension commands');

    // Set the extension context for commands that need it
    setCommandContext(context);

    // Set the provider for commands that need view navigation
    setCommandProvider(zgxProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.SET_LOG_LEVEL, setLogLevelCommand),
        vscode.commands.registerCommand(COMMANDS.TOGGLE_TELEMETRY, toggleTelemetryCommand),
        vscode.commands.registerCommand(COMMANDS.SHOW_TELEMETRY_STATUS, showTelemetryStatusCommand),
        vscode.commands.registerCommand(COMMANDS.OPEN_LOG, openLog),
        vscode.commands.registerCommand(COMMANDS.SHOW_LOG_LOCATION, showLogLocation),
        vscode.commands.registerCommand(COMMANDS.UNPAIR_DEVICES, unpairDevicesCommand),
        vscode.commands.registerCommand(COMMANDS.PAIR_DETAILS, pairDetailsCommand)
    );
}

/**
 * Records a 'command executed' telemetry event.
 *
 * @param commandId The id of the command that was executed
 * @param properties Additional telemetry properties to include
 */
function trackCommandExecuted(commandId: string, properties: Record<string, string> = {}): void {
    telemetryService.trackEvent({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: { commandId, ...properties }
    });
}

/**
 * Logs, reports and surfaces a command failure to the user.
 *
 * @param logMessage Message to record via the logger
 * @param userMessage Message to display to the user
 * @param telemetryContext Telemetry context identifier for the error
 * @param error The error that was thrown
 */
function handleCommandError(logMessage: string, userMessage: string, telemetryContext: string, error: unknown): void {
    logger.error(logMessage, { error });
    vscode.window.showErrorMessage(userMessage);
    telemetryService.trackError({ eventType: TelemetryEventType.Error, error: error as Error, context: telemetryContext });
}


/**
 * Command handler for 'zgxToolkit.setLogLevel'.
 * Shows a QuickPick menu to select the log level.
 */
async function setLogLevelCommand(): Promise<void> {
    logger.debug('setLogLevel command invoked');

    try {
        // Show QuickPick with log level options
        const selected = await vscode.window.showQuickPick(
            Array.from(LOG_LEVEL_OPTIONS),
            {
                placeHolder: 'Select log level',
                title: 'Z Toolkit: Set Log Level'
            }
        );

        if (!selected) {
            logger.debug('Log level selection cancelled');
            return;
        }

        // Parse and set the log level
        const level = parseLogLevel(selected);
        logger.setLevel(level);

        // Save to configuration
        await configService.setLogLevel(level);

        // Show confirmation message
        vscode.window.showInformationMessage(
            `Z Toolkit: Log level set to ${selected}`
        );

        logger.info('Log level changed by user', { level: selected });
        trackCommandExecuted(COMMANDS.SET_LOG_LEVEL, { level: selected });

    } catch (error) {
        handleCommandError(
            'Failed to set log level',
            `Failed to set log level: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'set-log-level',
            error
        );
    }
}

/**
 * Command handler for 'zgxToolkit.toggleTelemetry'.
 * Toggles the telemetry enabled/disabled state.
 */
async function toggleTelemetryCommand(): Promise<void> {
    logger.debug('toggleTelemetry command invoked');

    try {
        // Get current telemetry state
        const currentState = configService.getTelemetryEnabled();
        const newState = !currentState;

        // Update configuration
        await configService.setTelemetryEnabled(newState);
        telemetryService.setEnabled(newState);

        // Show confirmation message
        const statusText = newState ? 'enabled' : 'disabled';
        const message = `Z Toolkit: Telemetry ${statusText}`;
        vscode.window.showInformationMessage(message);

        logger.info('Telemetry toggled by user', { enabled: newState });
        trackCommandExecuted(COMMANDS.TOGGLE_TELEMETRY, { enabled: newState.toString() });
    } catch (error) {
        handleCommandError(
            'Failed to toggle telemetry',
            `Failed to toggle telemetry: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'toggle-telemetry',
            error
        );
    }
}

/**
 * Command handler for 'zgxToolkit.showTelemetryStatus'.
 * Shows the current telemetry status.
 */
async function showTelemetryStatusCommand(): Promise<void> {
    logger.debug('showTelemetryStatus command invoked');

    try {
        trackCommandExecuted(COMMANDS.SHOW_TELEMETRY_STATUS);

        const enabled = configService.getTelemetryEnabled();
        const statusText = enabled ? 'ENABLED' : 'DISABLED';

        const message = `Z Toolkit Telemetry Status: ${statusText}`;

        const action = enabled ? 'Disable' : 'Enable';
        const selection = await vscode.window.showInformationMessage(
            message,
            action,
            'View Documentation'
        );

        if (selection === action) {
            // Toggle telemetry
            await toggleTelemetryCommand();
        } else if (selection === 'View Documentation') {
            // Open telemetry documentation
            const docPath = vscode.Uri.joinPath(
                context.extensionUri,
                'docs',
                'telemetry.md'
            );
            await vscode.commands.executeCommand('markdown.showPreview', docPath);
        }

        logger.debug('Telemetry status shown to user');
    } catch (error) {
        handleCommandError(
            'Failed to show telemetry status',
            `Failed to show telemetry status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'show-telemetry-status',
            error
        );
    }
}

/**
 * Command handler for 'zgxToolkit.openLog'.
 * Opens the current log file in the editor.
 */
async function openLog(): Promise<void> {
    
    try {
        trackCommandExecuted(COMMANDS.OPEN_LOG);

        const logPath = Logger.getInstance().currentLogFilePath;
        if (!logPath) {
            vscode.window.showErrorMessage('Log file path is not available');
            return;
        }
        const doc = await vscode.workspace.openTextDocument(logPath);
        await vscode.window.showTextDocument(doc);
    } catch (error) {
        const message = `Failed to open log file: ${error instanceof Error ? error.message : String(error)}`;
        handleCommandError(message, message, 'open-log', error);
    }
}

/**
 * Command handler for 'zgxToolkit.showLogLocation'.
 * Shows the log file location and provides options to open the log or copy the path.
 */
async function showLogLocation(): Promise<void> {
    trackCommandExecuted(COMMANDS.SHOW_LOG_LOCATION);
    vscode.window.showInformationMessage(
        `Log file location: ${Logger.getInstance().currentLogFilePath}`,
        'Open Log',
        'Copy Path'
    ).then(selection => {
        if (selection === 'Open Log') {
            vscode.commands.executeCommand(COMMANDS.OPEN_LOG);
        } else if (selection === 'Copy Path') {
            const logPath = Logger.getInstance().currentLogFilePath;
            if (!logPath) {
                vscode.window.showErrorMessage('Log file path is not available');
                return;
            }
            vscode.env.clipboard.writeText(logPath);
            vscode.window.showInformationMessage('Log file path copied to clipboard');
        }
    });
}

/**
 * Prompts the user to select a paired device group via QuickPick.
 * Resolves all current groups, filters out any that failed to resolve,
 * and shows an informational message if none are available.
 *
 * @param placeHolder QuickPick placeholder text
 * @param title QuickPick title
 * @returns The selected group's id, or undefined if cancelled/unavailable
 */
async function selectDeviceGroupId(placeHolder: string, title: string): Promise<string | undefined> {
    // Get all current groups and resolve their device details
    const allGroups = await connectxGroupService.getAllGroups();

    if (!allGroups || allGroups.length === 0) {
        vscode.window.showInformationMessage('Z Toolkit: No paired device groups found.');
        return undefined;
    }

    const groupInfos = await Promise.all(
        allGroups.map(group => connectxGroupService.getGroupInfo(group.id))
    );
    const validGroupInfos = groupInfos.filter(
        (info): info is NonNullable<typeof info> => info !== undefined
    );

    if (validGroupInfos.length === 0) {
        vscode.window.showInformationMessage('Z Toolkit: No valid paired device groups found.');
        return undefined;
    }

    // Build QuickPick items from groups
    const items = validGroupInfos.map(groupInfo => ({
        label: `[${groupInfo.devices.map(d => d.name).join(', ')}]`,
        groupId: groupInfo.group.id
    }));

    // Show group selection
    const selected = await vscode.window.showQuickPick(items, { placeHolder, title });

    return selected?.groupId;
}

/**
 * Command handler for 'zgxToolkit.unpairDevices'.
 * Shows a list of ConnectX groups and navigates to the unpair devices view
 * for the selected group.
 */
async function unpairDevicesCommand(): Promise<void> {
    logger.debug('unpairDevices command invoked');

    try {
        trackCommandExecuted(COMMANDS.UNPAIR_DEVICES);

        const groupId = await selectDeviceGroupId('Select a device group to unpair', 'Z Toolkit: Unpair Devices');

        if (!groupId) {
            logger.debug('Unpair devices selection cancelled');
            return;
        }

        // Navigate to the unpair devices view in the editor panel
        await commandProvider.openInEditor('groups/unpairDevices', { groupId });

        logger.info('Navigated to unpair devices view', { groupId });
    } catch (error) {
        handleCommandError(
            'Failed to unpair devices',
            `Failed to unpair devices: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'unpair-devices',
            error
        );
    }
}

// Store extension context for use in commands that need it
let context: vscode.ExtensionContext;

/**
 * Set the extension context for commands that need access to it.
 * This should be called during extension activation.
 * 
 * @param extensionContext The extension context
 */
export function setCommandContext(extensionContext: vscode.ExtensionContext): void {
    context = extensionContext;
}

// Store provider reference for commands that need view navigation
let commandProvider: ZgxToolkitProvider;

/**
 * Set the provider for commands that need to navigate to views.
 * This should be called during extension activation.
 * 
 * @param zgxProvider The Z Toolkit provider
 */
export function setCommandProvider(zgxProvider: ZgxToolkitProvider): void {
    commandProvider = zgxProvider;
}

/**
 * Command handler for 'zgxToolkit.pairDetails'.
 * Shows a list of ConnectX groups for the user to select, then opens the
 * pair details view in the editor panel for the selected group.
 */
async function pairDetailsCommand(): Promise<void> {
    logger.debug('pairDetails command invoked');

    try {
        trackCommandExecuted(COMMANDS.PAIR_DETAILS);

        const groupId = await selectDeviceGroupId('Select a device group to view details', 'Z Toolkit: Pairing Details');

        if (!groupId) {
            logger.debug('Pair details selection cancelled');
            return;
        }

        // Navigate to pair details view in the editor panel
        await commandProvider.openInEditor('groups/pairDetails', { groupId });

        logger.info('Navigated to pair details view', { groupId });
    } catch (error) {
        handleCommandError(
            'Failed to show pair details',
            `Failed to show pairing details: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'pair-details',
            error
        );
    }
}
