/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Logging level constants for the ZGX Toolkit extension.
 * Provides mapping between string values and LogLevel enum.
 */

import { LogLevel } from '../types/logger';

/**
 * String representations of log levels.
 * Used for configuration and UI display.
 */
export const LOG_LEVEL_NAMES = {
  [LogLevel.ERROR]: 'Error',
  [LogLevel.WARN]: 'Warn',
  [LogLevel.INFO]: 'Info',
  [LogLevel.DEBUG]: 'Debug',
  [LogLevel.TRACE]: 'Trace',
} as const;

/**
 * Reverse mapping from string names to LogLevel enum values.
 */
export const LOG_LEVEL_FROM_NAME: Record<string, LogLevel> = {
  'Error': LogLevel.ERROR,
  'error': LogLevel.ERROR,
  'ERROR': LogLevel.ERROR,
  'Warn': LogLevel.WARN,
  'warn': LogLevel.WARN,
  'WARN': LogLevel.WARN,
  'Warning': LogLevel.WARN,
  'warning': LogLevel.WARN,
  'WARNING': LogLevel.WARN,
  'Info': LogLevel.INFO,
  'info': LogLevel.INFO,
  'INFO': LogLevel.INFO,
  'Debug': LogLevel.DEBUG,
  'debug': LogLevel.DEBUG,
  'DEBUG': LogLevel.DEBUG,
  'Trace': LogLevel.TRACE,
  'trace': LogLevel.TRACE,
  'TRACE': LogLevel.TRACE,
};

/**
 * Default log level for the extension.
 */
export const DEFAULT_LOG_LEVEL = LogLevel.INFO;

/**
 * Array of log level names for use in UI (QuickPick, etc.).
 */
export const LOG_LEVEL_OPTIONS = [
  LOG_LEVEL_NAMES[LogLevel.ERROR],
  LOG_LEVEL_NAMES[LogLevel.WARN],
  LOG_LEVEL_NAMES[LogLevel.INFO],
  LOG_LEVEL_NAMES[LogLevel.DEBUG],
  LOG_LEVEL_NAMES[LogLevel.TRACE],
] as const;

/**
 * Parse a log level name to a LogLevel enum value.
 * Returns the default level if the name is invalid.
 * 
 * @param name Log level name (case-insensitive)
 * @returns LogLevel enum value
 */
export function parseLogLevel(name: string): LogLevel {
  return LOG_LEVEL_FROM_NAME[name] ?? DEFAULT_LOG_LEVEL;
}

/**
 * Get the display name for a log level.
 * 
 * @param level LogLevel enum value
 * @returns Display name
 */
export function getLogLevelName(level: LogLevel): string {
  return LOG_LEVEL_NAMES[level] ?? LOG_LEVEL_NAMES[DEFAULT_LOG_LEVEL];
}
