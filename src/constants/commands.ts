/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * VS Code command identifiers for the ZGX Toolkit extension.
 * These commands can be invoked via the command palette or programmatically.
 */

/**
 * All commands available in the extension.
 * Combines legacy and new commands for easy access.
 */
export const COMMANDS = {
  /** Test device discovery functionality */
  TEST_DISCOVERY: 'zgxToolkit.testDiscovery',
  /** Open the log file in an editor */
  OPEN_LOG: 'zgxToolkit.openLog',
  /** Show the log file location in file explorer */
  SHOW_LOG_LOCATION: 'zgxToolkit.showLogLocation',
  /** Set the log level for the extension */
  SET_LOG_LEVEL: 'zgxToolkit.setLogLevel',
  /** Toggle telemetry on/off */
  TOGGLE_TELEMETRY: 'zgxToolkit.toggleTelemetry',
  /** Show current telemetry status */
  SHOW_TELEMETRY_STATUS: 'zgxToolkit.showTelemetryStatus',
} as const;

/**
 * Type for command identifiers.
 */
export type CommandId = typeof COMMANDS[keyof typeof COMMANDS];