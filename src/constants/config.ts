/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Configuration keys and default values for the ZGX Toolkit extension.
 * These correspond to VS Code workspace/user settings.
 */

/**
 * Configuration section for all extension settings.
 */
export const CONFIG_SECTION = 'zgxToolkit' as const;

/**
 * Configuration keys used by the extension.
 */
export const CONFIG_KEYS = {
  /** Log level setting (Error, Warn, Info, Debug, Trace) */
  LOG_LEVEL: 'zgxToolkit.logLevel',
  /** Whether telemetry is enabled */
  TELEMETRY_ENABLED: 'zgxToolkit.telemetry.enabled',
  /** Storage key for devices in globalState */
  MACHINES_STORAGE_KEY: 'devices',
} as const;

/**
 * Default configuration values.
 */
export const CONFIG_DEFAULTS = {
  /** Default log level is INFO */
  LOG_LEVEL: 'Info',
  /**
   * Telemetry enabled by default. VSCode's telemetry setting also
   * needs to be enabled for our telemetry to be active.
   */
  TELEMETRY_ENABLED: true,
} as const;

/**
 * Valid log level string values for configuration.
 */
export const LOG_LEVEL_VALUES = ['Error', 'Warn', 'Info', 'Debug', 'Trace'] as const;

/**
 * Type for log level configuration values.
 */
export type LogLevelValue = typeof LOG_LEVEL_VALUES[number];

/**
 * Type for configuration keys.
 */
export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];

/**
 * External URLs used by the extension.
 */
export const URLS = {
  /** ZGX Toolkit documentation wiki */
  ZGX_DOCS: 'https://github.com/HPInc/ZGX-Toolkit/wiki',
} as const;
