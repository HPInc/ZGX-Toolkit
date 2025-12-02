/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Production-ready logging system for the ZGX Toolkit extension.
 * Provides configurable logging with multiple severity levels and VS Code integration.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILogger, LogLevel, LogContext } from '../types/logger';
import { LOG_LEVEL_NAMES } from '../constants/logLevels';

/**
 * Configuration constants for log rotation
 */
const LOG_RETENTION_DAYS = 3; // Number of daily log files to keep (configurable)

/**
 * Logger implementation using VS Code's OutputChannel and file-based logging.
 * Implements the singleton pattern to ensure a single logger instance.
 */
class Logger implements ILogger {
  private static instance: Logger | null = null;
  private outputChannel: vscode.OutputChannel;
  private currentLevel: LogLevel = LogLevel.INFO;
  private logFilePath?: string;
  private logStream?: fs.WriteStream;

  // Constants for log rotation
  private readonly MAX_LOG_FILES_TO_KEEP = LOG_RETENTION_DAYS; // Keep last N daily log files
  private currentLogDate?: string; // Track the date of the current log file

  /**
   * Private constructor to enforce singleton pattern.
   * Use Logger.getInstance() to get the logger instance.
   */
  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('ZGX Toolkit');
    this.initializeFileLogging();
  }

  /**
   * Get the singleton logger instance.
   * Creates the instance on first call.
   * 
   * @returns The logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Initialize file-based logging.
   * Creates log directory and sets up log file with rotation.
   */
  private initializeFileLogging(): void {
    try {
      // Create logs directory in user's home
      const logDir = path.join(os.homedir(), '.zgx-toolkit', 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this.logFilePath = path.join(logDir, 'zgx-toolkit.log');

      // Rotate log file if necessary (daily rotation)
      this.rotateLogFileIfNeeded();

      // Create write stream for logging
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

      // Log initialization
      this.info('ZGX Toolkit logger initialized');
    } catch (error) {
      // If file logging fails, continue with OutputChannel only
      console.error('Failed to initialize file logging:', error);
    }
  }

  public get currentLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Rotate log file if it's from a different day.
   * Archives previous day's logs with YYYY-MM-DD suffix and keeps only the last MAX_LOG_FILES_TO_KEEP files.
   */
  private rotateLogFileIfNeeded(): void {
    if (!this.logFilePath) {
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    try {
      // If this is the first time or the current log file doesn't exist, initialize
      if (!fs.existsSync(this.logFilePath)) {
        this.currentLogDate = today;
        return;
      }

      // Check if we need to rotate based on file date
      const stats = fs.statSync(this.logFilePath);
      const fileDate = stats.mtime.toISOString().split('T')[0]; // YYYY-MM-DD format

      // If we haven't set currentLogDate yet, initialize it
      if (!this.currentLogDate) {
        this.currentLogDate = fileDate;
      }

      // If the file is from a different day than today, rotate it
      if (fileDate !== today) {
        this.performDailyRotation(fileDate);
        this.currentLogDate = today;
      } else {
        // File is from today, just make sure currentLogDate is set correctly
        this.currentLogDate = today;
      }
    } catch (error) {
      console.error('Failed to check log file for rotation:', error);
    }
  }

  /**
   * Perform the actual daily log rotation.
   * @param previousDate The date of the log file being rotated
   */
  private performDailyRotation(previousDate: string): void {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
      return;
    }

    try {
      // Close existing stream if open
      if (this.logStream) {
        this.logStream.end();
        this.logStream = undefined;
      }

      // Create the archived log file name with date suffix
      const logDir = path.dirname(this.logFilePath);
      const logBaseName = path.basename(this.logFilePath, '.log');
      const archivedLogPath = path.join(logDir, `${logBaseName}-${previousDate}.log`);

      // Rename current log file to archived name
      fs.renameSync(this.logFilePath, archivedLogPath);

      // Clean up old log files, keeping only the last MAX_LOG_FILES_TO_KEEP
      this.cleanupOldLogFiles();
    } catch (error) {
      console.error('Failed to perform daily log rotation:', error);
    }
  }

  /**
   * Clean up old archived log files, keeping only the most recent ones.
   */
  private cleanupOldLogFiles(): void {
    if (!this.logFilePath) {
      return;
    }

    try {
      const logDir = path.dirname(this.logFilePath);
      const logBaseName = path.basename(this.logFilePath).replace('.log', '');
      
      // Find all archived log files
      const files = fs.readdirSync(logDir);
      const archivedFiles = files
        .filter(file => file.startsWith(`${logBaseName}-`) && file.endsWith('.log'))
        .map(file => {
          const fullPath = path.join(logDir, file);
          const stats = fs.statSync(fullPath);
          return {
            path: fullPath,
            name: file,
            mtime: stats.mtime
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by modification time, newest first

      // Keep only the most recent MAX_LOG_FILES_TO_KEEP files
      const filesToDelete = archivedFiles.slice(this.MAX_LOG_FILES_TO_KEEP);
      
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  /**
   * Set the current log level.
   * Messages below this level will not be logged.
   * 
   * @param level The log level to set
   */
  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
    this.info(`Log level set to ${LOG_LEVEL_NAMES[level]}`);
  }

  /**
   * Get the current log level.
   * 
   * @returns The current log level
   */
  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Log an error message.
   * Error messages are always logged regardless of log level.
   * 
   * @param message The error message
   * @param context Optional additional context
   */
  public error(message: string, context?: LogContext): void {
    if (this.currentLevel >= LogLevel.ERROR) {
      this.log('ERROR', message, context);
    }
  }

  /**
   * Log a warning message.
   * 
   * @param message The warning message
   * @param context Optional additional context
   */
  public warn(message: string, context?: LogContext): void {
    if (this.currentLevel >= LogLevel.WARN) {
      this.log('WARN', message, context);
    }
  }

  /**
   * Log an informational message.
   * 
   * @param message The informational message
   * @param context Optional additional context
   */
  public info(message: string, context?: LogContext): void {
    if (this.currentLevel >= LogLevel.INFO) {
      this.log('INFO', message, context);
    }
  }

  /**
   * Log a debug message.
   * 
   * @param message The debug message
   * @param context Optional additional context
   */
  public debug(message: string, context?: LogContext): void {
    if (this.currentLevel >= LogLevel.DEBUG) {
      this.log('DEBUG', message, context);
    }
  }

  /**
   * Log a trace message.
   * Trace messages are only logged at the TRACE level.
   * 
   * @param message The trace message
   * @param context Optional additional context
   */
  public trace(message: string, context?: LogContext): void {
    if (this.currentLevel >= LogLevel.TRACE) {
      this.log('TRACE', message, context);
    }
  }

  /**
   * Show the output channel in VS Code.
   * This brings the log output into view for the user.
   */
  public show(): void {
    this.outputChannel.show();
  }

  /**
   * Get the path to the log file, if applicable.
   * 
   * @returns The log file path or undefined
   */
  public getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Set the log file path for reference.
   * Note: This implementation uses VS Code's OutputChannel,
   * which handles file writing internally.
   * 
   * @param path The log file path
   */
  public setLogFilePath(path: string): void {
    this.logFilePath = path;
    this.debug('Log file path set', { path });
  }

  /**
   * Internal logging method that formats and outputs messages.
   * 
   * @param level The log level name
   * @param message The message to log
   * @param context Optional additional context
   */
  private log(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}] ${message}`;

    // Append context if provided
    if (context) {
      try {
        // Sanitize context to avoid logging sensitive data
        const sanitizedContext = this.sanitizeContext(context);
        const contextStr = JSON.stringify(sanitizedContext, null, 2);
        logMessage += `\n${contextStr}`;
      } catch (error) {
        // If JSON serialization fails, log a fallback message
        logMessage += '\n[Context serialization failed]';
      }
    }

    // Write to output channel
    this.outputChannel.appendLine(logMessage);

    // Write to file if available
    if (this.logStream) {
      try {
        this.logStream.write(logMessage + '\n');

        // Check if daily rotation is needed
        this.rotateLogFileIfNeeded();
        
        // Recreate stream if it was closed during rotation
        if (!this.logStream && this.logFilePath) {
          this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
        }
      } catch (error) {
        // If file write fails, continue with OutputChannel only
        console.error('Failed to write to log file:', error);
      }
    }
  }

  /**
   * Sanitize context object to remove potentially sensitive data.
   * This is a simple implementation that can be extended based on needs.
   * 
   * @param context The context object to sanitize
   * @returns Sanitized context object
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};
    const sensitivePatterns = ['password', 'token', 'secret', 'auth', 'credential', 'apikey', 'api_key'];

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      // Only redact if the key contains a sensitive pattern
      const isSensitive = sensitivePatterns.some(pattern => lowerKey.includes(pattern));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value instanceof Error) {
        // Special handling for Error objects
        sanitized[key] = {
          message: value.message,
          name: value.name,
          stack: value.stack,
        };
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeContext(value as LogContext);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Dispose of logger resources.
   * Should be called when the extension is deactivated.
   */
  public dispose(): void {
    // Close log stream
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }

    // Dispose output channel
    this.outputChannel.dispose();

    // Clear singleton instance
    Logger.instance = null;
  }
}

/**
 * Singleton logger instance for use throughout the extension.
 * Import this to access logging functionality.
 * 
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 * 
 * logger.info('Extension activated');
 * logger.error('Something went wrong', { error: err });
 * ```
 */
export const logger = Logger.getInstance();

/**
 * Export the Logger class for testing purposes.
 */
export { Logger };
