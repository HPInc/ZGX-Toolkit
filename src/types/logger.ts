/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Logger type definitions for the ZGX Toolkit extension.
 * Provides type-safe logging with multiple severity levels.
 */

/**
 * Severity levels for logging operations.
 * Higher numeric values represent more verbose logging.
 */
export enum LogLevel {
  /** Critical errors that prevent functionality */
  ERROR = 0,
  /** Warning conditions that should be investigated */
  WARN = 1,
  /** General informational messages */
  INFO = 2,
  /** Detailed debugging information */
  DEBUG = 3,
  /** Very detailed trace information */
  TRACE = 4
}

/**
 * Context object for providing additional information with log messages.
 * Can contain any serializable data relevant to the log entry.
 */
export type LogContext = Record<string, any>;

/**
 * Interface for logger implementations.
 * All logger implementations must provide these methods.
 */
export interface ILogger {
  /**
   * Set the current log level.
   * @param level The log level to set
   */
  setLevel(level: LogLevel): void;

  /**
   * Get the current log level.
   * @returns The current log level
   */
  getLevel(): LogLevel;

  /**
   * Log an error message.
   * @param message The error message
   * @param context Optional additional context
   */
  error(message: string, context?: LogContext): void;

  /**
   * Log a warning message.
   * @param message The warning message
   * @param context Optional additional context
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log an informational message.
   * @param message The informational message
   * @param context Optional additional context
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a debug message.
   * @param message The debug message
   * @param context Optional additional context
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log a trace message.
   * @param message The trace message
   * @param context Optional additional context
   */
  trace(message: string, context?: LogContext): void;

  /**
   * Show the logger output channel in VS Code.
   */
  show(): void;

  /**
   * Get the path to the log file, if applicable.
   * @returns The log file path or undefined
   */
  getLogFilePath(): string | undefined;
}
