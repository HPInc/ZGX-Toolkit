/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for command handlers.
 */

import * as vscode from 'vscode';
import { registerCommands, setCommandContext } from '../../commands/index';
import { logger, Logger } from '../../utils/logger';
import { telemetryService } from '../../services/telemetryService';
import { configService } from '../../services/configService';
import { COMMANDS } from '../../constants/commands';
import { LogLevel } from '../../types/logger';
import { TelemetryEventType } from '../../types/telemetry';

// Mock VS Code API
jest.mock('vscode');
jest.mock('../../utils/logger');
jest.mock('../../services/telemetryService');
jest.mock('../../services/configService');

describe('Command Handlers', () => {
  let mockContext: vscode.ExtensionContext;
  let commandHandlers: Map<string, (...args: any[]) => any>;

  beforeEach(() => {
    // Reset command handlers
    commandHandlers = new Map();

    // Create mock extension context
    mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/mock/extension/path'),
    } as any;

    // Mock registerCommand to capture handlers
    (vscode.commands.registerCommand as jest.Mock).mockImplementation(
      (command: string, handler: (...args: any[]) => any) => {
        commandHandlers.set(command, handler);
        return { dispose: jest.fn() };
      }
    );

    // Mock window methods
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);

    // Add showTextDocument to window mock if not present
    if (!vscode.window.showTextDocument) {
      (vscode.window as any).showTextDocument = jest.fn().mockResolvedValue({});
    } else {
      (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({});
    }

    // Mock workspace methods
    // Add openTextDocument to workspace mock if not present
    if (!vscode.workspace.openTextDocument) {
      (vscode.workspace as any).openTextDocument = jest.fn().mockResolvedValue({});
    } else {
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});
    }

    // Mock logger methods
    (logger.debug as jest.Mock).mockReturnValue(undefined);
    (logger.info as jest.Mock).mockReturnValue(undefined);
    (logger.error as jest.Mock).mockReturnValue(undefined);
    (logger.setLevel as jest.Mock).mockReturnValue(undefined);

    // Mock Logger.getInstance()
    (Logger.getInstance as jest.Mock).mockReturnValue({
      currentLogFilePath: '/mock/log/path/zgx-toolkit.log',
    });

    // Mock telemetry service methods
    (telemetryService.trackEvent as jest.Mock).mockReturnValue(undefined);
    (telemetryService.trackError as jest.Mock).mockReturnValue(undefined);
    (telemetryService.setEnabled as jest.Mock).mockReturnValue(undefined);

    // Mock config service methods
    (configService.setLogLevel as jest.Mock).mockResolvedValue(undefined);
    (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
    (configService.setTelemetryEnabled as jest.Mock).mockResolvedValue(undefined);

    // Mock clipboard
    (vscode.env.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);

    // Mock executeCommand
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerCommands', () => {
    it('should register all commands', () => {
      registerCommands(mockContext);

      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        COMMANDS.SET_LOG_LEVEL,
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        COMMANDS.TOGGLE_TELEMETRY,
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        COMMANDS.SHOW_TELEMETRY_STATUS,
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        COMMANDS.OPEN_LOG,
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        COMMANDS.SHOW_LOG_LOCATION,
        expect.any(Function)
      );
    });

    it('should add command disposables to subscriptions', () => {
      registerCommands(mockContext);

      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it('should set command context', () => {
      registerCommands(mockContext);
      expect(logger.debug).toHaveBeenCalledWith('Registering extension commands');
    });
  });

  describe('setLogLevelCommand', () => {
    beforeEach(() => {
      registerCommands(mockContext);
    });

    it('should show QuickPick with log level options', async () => {
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      
      await handler?.();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining(['Error', 'Warn', 'Info', 'Debug', 'Trace']),
        {
          placeHolder: 'Select log level',
          title: 'ZGX Toolkit: Set Log Level',
        }
      );
    });

    it('should track command invocation', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Info');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      
      await handler?.();

      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: expect.objectContaining({
          commandId: COMMANDS.SET_LOG_LEVEL
        })
      });
      expect(logger.debug).toHaveBeenCalledWith('setLogLevel command invoked');
    });

    it('should do nothing when selection is cancelled', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.debug).toHaveBeenCalledWith('Log level selection cancelled');
      expect(logger.setLevel).not.toHaveBeenCalled();
      expect(configService.setLogLevel).not.toHaveBeenCalled();
    });

    it('should set log level to DEBUG when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Debug');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.setLevel).toHaveBeenCalledWith(LogLevel.DEBUG);
      expect(configService.setLogLevel).toHaveBeenCalledWith(LogLevel.DEBUG);
    });

    it('should set log level to ERROR when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Error');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.setLevel).toHaveBeenCalledWith(LogLevel.ERROR);
      expect(configService.setLogLevel).toHaveBeenCalledWith(LogLevel.ERROR);
    });

    it('should set log level to WARN when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Warn');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.setLevel).toHaveBeenCalledWith(LogLevel.WARN);
      expect(configService.setLogLevel).toHaveBeenCalledWith(LogLevel.WARN);
    });

    it('should set log level to INFO when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Info');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.setLevel).toHaveBeenCalledWith(LogLevel.INFO);
      expect(configService.setLogLevel).toHaveBeenCalledWith(LogLevel.INFO);
    });

    it('should set log level to TRACE when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Trace');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.setLevel).toHaveBeenCalledWith(LogLevel.TRACE);
      expect(configService.setLogLevel).toHaveBeenCalledWith(LogLevel.TRACE);
    });

    it('should show confirmation message after setting log level', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Debug');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'ZGX Toolkit: Log level set to Debug'
      );
    });

    it('should log the change', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Error');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.info).toHaveBeenCalledWith('Log level changed by user', { level: 'Error' });
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.SET_LOG_LEVEL,
          level: 'Error'
        }
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Config update failed');
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Debug');
      (configService.setLogLevel as jest.Mock).mockRejectedValue(error);
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(logger.error).toHaveBeenCalledWith('Failed to set log level', { error });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to set log level: Config update failed'
      );
      expect(telemetryService.trackError).toHaveBeenCalledWith({
        eventType: 'error',
        error,
        context: 'set-log-level'
      });
    });

    it('should handle non-Error exceptions', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Debug');
      (configService.setLogLevel as jest.Mock).mockRejectedValue('string error');
      
      const handler = commandHandlers.get(COMMANDS.SET_LOG_LEVEL);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to set log level: Unknown error'
      );
    });
  });

  describe('toggleTelemetryCommand', () => {
    beforeEach(() => {
      registerCommands(mockContext);
    });

    it('should track command invocation', async () => {
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      
      await handler?.();

      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.TOGGLE_TELEMETRY,
          enabled: 'true'
        }
      });
      expect(logger.debug).toHaveBeenCalledWith('toggleTelemetry command invoked');
    });

    it('should enable telemetry when currently disabled', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(configService.setTelemetryEnabled).toHaveBeenCalledWith(true);
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should disable telemetry when currently enabled', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(configService.setTelemetryEnabled).toHaveBeenCalledWith(false);
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
    });

    it('should show confirmation message when enabling with note', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'ZGX Toolkit: Telemetry enabled'
      );
    });

    it('should show confirmation message when disabling', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'ZGX Toolkit: Telemetry disabled'
      );
    });

    it('should log the toggle action', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(logger.info).toHaveBeenCalledWith('Telemetry toggled by user', { enabled: true });
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.TOGGLE_TELEMETRY,
          enabled: 'true'
        }
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Config update failed');
      (configService.setTelemetryEnabled as jest.Mock).mockRejectedValue(error);
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(logger.error).toHaveBeenCalledWith('Failed to toggle telemetry', { error });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to toggle telemetry: Config update failed'
      );
      expect(telemetryService.trackError).toHaveBeenCalledWith({
        eventType: 'error',
        error,
        context: 'toggle-telemetry'
      });
    });

    it('should handle non-Error exceptions', async () => {
      (configService.setTelemetryEnabled as jest.Mock).mockRejectedValue('string error');
      
      const handler = commandHandlers.get(COMMANDS.TOGGLE_TELEMETRY);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to toggle telemetry: Unknown error'
      );
    });
  });

  describe('showTelemetryStatusCommand', () => {
    beforeEach(() => {
      registerCommands(mockContext);
    });

    it('should track command invocation', async () => {
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      
      await handler?.();

      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.SHOW_TELEMETRY_STATUS
        }
      });
      expect(logger.debug).toHaveBeenCalledWith('showTelemetryStatus command invoked');
    });

    it('should show status message when telemetry is enabled', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('ZGX Toolkit Telemetry Status: ENABLED'),
        'Disable',
        'View Documentation'
      );
    });

    it('should show status message when telemetry is disabled', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('ZGX Toolkit Telemetry Status: DISABLED'),
        'Enable',
        'View Documentation'
      );
    });

    it('should show correct status message', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'ZGX Toolkit Telemetry Status: DISABLED',
        expect.any(String),
        expect.any(String)
      );
    });

    it('should toggle telemetry when Enable button is clicked', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Enable');
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      // Should be called twice: once for status, once for toggle
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.SHOW_TELEMETRY_STATUS
        }
      });
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.TOGGLE_TELEMETRY,
          enabled: 'true'
        }
      });
    });

    it('should toggle telemetry when Disable button is clicked', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Disable');
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      // Should be called twice: once for status, once for toggle
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.SHOW_TELEMETRY_STATUS
        }
      });
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: {
          commandId: COMMANDS.TOGGLE_TELEMETRY,
          enabled: 'false'
        }
      });
    });

    it('should open documentation when View Documentation button is clicked', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('View Documentation');
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'markdown.showPreview',
        expect.objectContaining({
          fsPath: expect.stringContaining('docs/telemetry.md')
        })
      );
    });

    it('should log when status is shown', async () => {
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(logger.debug).toHaveBeenCalledWith('Telemetry status shown to user');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Failed to get status');
      (configService.getTelemetryEnabled as jest.Mock).mockImplementation(() => {
        throw error;
      });
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(logger.error).toHaveBeenCalledWith('Failed to show telemetry status', { error });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to show telemetry status: Failed to get status'
      );
      expect(telemetryService.trackError).toHaveBeenCalledWith({
        eventType: 'error',
        error,
        context: 'show-telemetry-status'
      });
    });

    it('should handle non-Error exceptions', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockImplementation(() => {
        throw 'string error';
      });
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to show telemetry status: Unknown error'
      );
    });

    it('should do nothing when message is dismissed', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
      
      const handler = commandHandlers.get(COMMANDS.SHOW_TELEMETRY_STATUS);
      await handler?.();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        'markdown.showPreview',
        expect.anything()
      );
      // Should only be called once for the status command itself
      expect(telemetryService.trackEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('openLog', () => {
    beforeEach(() => {
      registerCommands(mockContext);
    });

    it('should open log file when path is available', async () => {
      const mockDoc = { uri: '/mock/log/path/zgx-toolkit.log' };
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(mockDoc);
      
      const handler = commandHandlers.get(COMMANDS.OPEN_LOG);
      await handler?.();

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith('/mock/log/path/zgx-toolkit.log');
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDoc);
    });

    it('should show error message when log path is not available', async () => {
      (Logger.getInstance as jest.Mock).mockReturnValue({
        currentLogFilePath: undefined,
      });
      
      const handler = commandHandlers.get(COMMANDS.OPEN_LOG);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Log file path is not available');
      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('should handle errors when opening log file', async () => {
      const error = new Error('File not found');
      (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue(error);
      
      const handler = commandHandlers.get(COMMANDS.OPEN_LOG);
      await handler?.();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to open log file: File not found',
        { error }
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to open log file: File not found'
      );
    });

    it('should handle non-Error exceptions', async () => {
      (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue('string error');
      
      const handler = commandHandlers.get(COMMANDS.OPEN_LOG);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to open log file: string error'
      );
    });
  });

  describe('showLogLocation', () => {
    beforeEach(() => {
      registerCommands(mockContext);
    });

    it('should show information message with log file location', async () => {
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Log file location: /mock/log/path/zgx-toolkit.log',
        'Open Log',
        'Copy Path'
      );
    });

    it('should open log when Open Log button is clicked', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Open Log');
      
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(COMMANDS.OPEN_LOG);
    });

    it('should copy path to clipboard when Copy Path button is clicked', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Copy Path');
      
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/mock/log/path/zgx-toolkit.log');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Log file path copied to clipboard'
      );
    });

    it('should handle when log path is not available for copy', async () => {
      (Logger.getInstance as jest.Mock).mockReturnValue({
        currentLogFilePath: undefined,
      });
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Copy Path') // First call returns "Copy Path"
        .mockResolvedValueOnce(undefined);  // Second call (if any) returns undefined
      
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Log file path is not available');
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('should do nothing when message is dismissed', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
      
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('should handle undefined log path in initial message', async () => {
      (Logger.getInstance as jest.Mock).mockReturnValue({
        currentLogFilePath: undefined,
      });
      
      const handler = commandHandlers.get(COMMANDS.SHOW_LOG_LOCATION);
      await handler?.();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Log file location: undefined',
        'Open Log',
        'Copy Path'
      );
    });
  });

  describe('setCommandContext', () => {
    it('should set the context for commands', () => {
      const testContext = {
        subscriptions: [],
        extensionUri: vscode.Uri.file('/test/path'),
      } as any;

      setCommandContext(testContext);
      
      // Register commands after setting context
      registerCommands(testContext);

      // Verify context was set by checking that commands were registered
      expect(vscode.commands.registerCommand).toHaveBeenCalled();
    });
  });
});
