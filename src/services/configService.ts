/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Configuration service for the ZGX Toolkit extension.
 * Provides type-safe access to VS Code configuration settings.
 */

import * as vscode from 'vscode';
import { LogLevel } from '../types/logger';
import { CONFIG_SECTION, CONFIG_DEFAULTS } from '../constants/config';
import { parseLogLevel, getLogLevelName } from '../constants/logLevels';
import { logger } from '../utils/logger';

/**
 * Configuration service implementation.
 * Provides methods to get and set extension configuration values.
 */
class ConfigService {
  /**
   * Get the VS Code configuration object for the extension.
   * 
   * @returns VS Code workspace configuration
   */
  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  /**
   * Get the current log level from configuration.
   * 
   * @returns The current log level
   */
  public getLogLevel(): LogLevel {
    const levelName = this.get<string>('logLevel', CONFIG_DEFAULTS.LOG_LEVEL);
    return parseLogLevel(levelName);
  }

  /**
   * Set the log level in configuration.
   * 
   * @param level The log level to set
   */
  public async setLogLevel(level: LogLevel): Promise<void> {
    const levelName = getLogLevelName(level);
    await this.set('logLevel', levelName);
    logger.debug('Log level updated in configuration', { level: levelName });
  }

  /**
   * Get whether telemetry is enabled from configuration.
   * 
   * @returns True if telemetry is enabled
   */
  public getTelemetryEnabled(): boolean {
    return this.get<boolean>('telemetry.enabled', CONFIG_DEFAULTS.TELEMETRY_ENABLED);
  }

  /**
   * Set whether telemetry is enabled in configuration.
   * 
   * @param enabled Whether to enable telemetry
   */
  public async setTelemetryEnabled(enabled: boolean): Promise<void> {
    await this.set('telemetry.enabled', enabled);
    logger.debug('Telemetry setting updated in configuration', { enabled });
  }

  /**
   * Get a configuration value.
   * 
   * @param key Configuration key (without the section prefix)
   * @param defaultValue Default value if key is not set
   * @returns The configuration value
   */
  public get<T>(key: string, defaultValue?: T): T {
    const config = this.getConfig();
    return config.get<T>(key, defaultValue as T);
  }

  /**
   * Set a configuration value.
   * 
   * @param key Configuration key (without the section prefix)
   * @param value Value to set
   */
  public async set<T>(key: string, value: T): Promise<void> {
    const config = this.getConfig();
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Singleton configuration service instance.
 * Import this to access configuration throughout the extension.
 * 
 * @example
 * ```typescript
 * import { configService } from './services/configService';
 * 
 * const logLevel = configService.getLogLevel();
 * await configService.setLogLevel(LogLevel.DEBUG);
 * ```
 */
export const configService = new ConfigService();

/**
 * Export the ConfigService class for testing purposes.
 */
export { ConfigService };
