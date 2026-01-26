/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the configuration service.
 */

import { ConfigService } from '../../services/configService';
import { LogLevel } from '../../types/logger';
import { logger } from '../../utils/logger';
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode');
jest.mock('../../utils/logger');

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockWorkspaceConfig: jest.Mocked<vscode.WorkspaceConfiguration>;

  beforeEach(() => {
    // Create mock workspace configuration
    mockWorkspaceConfig = {
      get: jest.fn(),
      update: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn(),
    } as any;

    // Mock getConfiguration
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);

    configService = new ConfigService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Get Log Level', () => {
    it('should get log level from configuration', () => {
      mockWorkspaceConfig.get.mockReturnValue('Debug');
      
      const level = configService.getLogLevel();
      
      expect(level).toBe(LogLevel.DEBUG);
      expect(mockWorkspaceConfig.get).toHaveBeenCalledWith('logLevel', 'Info');
    });

    it('should return INFO for invalid log level', () => {
      mockWorkspaceConfig.get.mockReturnValue('InvalidLevel');
      
      const level = configService.getLogLevel();
      
      expect(level).toBe(LogLevel.INFO);
    });

    it('should use default value when not configured', () => {
      mockWorkspaceConfig.get.mockReturnValue('Info');
      
      const level = configService.getLogLevel();
      
      expect(level).toBe(LogLevel.INFO);
    });

    it('should handle case-insensitive log level names', () => {
      mockWorkspaceConfig.get.mockReturnValue('trace');
      
      const level = configService.getLogLevel();
      
      expect(level).toBe(LogLevel.TRACE);
    });
  });

  describe('Set Log Level', () => {
    it('should set log level in configuration', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.setLogLevel(LogLevel.DEBUG);
      
      expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
        'logLevel',
        'Debug',
        vscode.ConfigurationTarget.Global
      );
    });

    it('should log debug message', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.setLogLevel(LogLevel.ERROR);
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Log level updated in configuration',
        { level: 'Error' }
      );
    });
  });

  describe('Get Telemetry Enabled', () => {
    it('should get telemetry enabled from configuration', () => {
      mockWorkspaceConfig.get.mockReturnValue(true);
      
      const enabled = configService.getTelemetryEnabled();
      
      expect(enabled).toBe(true);
      expect(mockWorkspaceConfig.get).toHaveBeenCalledWith('telemetry.enabled', true);
    });

    it('should return false when disabled', () => {
      mockWorkspaceConfig.get.mockReturnValue(false);
      
      const enabled = configService.getTelemetryEnabled();
      
      expect(enabled).toBe(false);
    });

    it('should default to true when not configured', () => {
      mockWorkspaceConfig.get.mockImplementation((key, defaultValue) => defaultValue);
      
      const enabled = configService.getTelemetryEnabled();
      
      expect(enabled).toBe(true);
    });
  });

  describe('Set Telemetry Enabled', () => {
    it('should set telemetry enabled in configuration', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.setTelemetryEnabled(true);
      
      expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
        'telemetry.enabled',
        true,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should log debug message', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.setTelemetryEnabled(false);
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Telemetry setting updated in configuration',
        { enabled: false }
      );
    });
  });

  describe('Generic Get', () => {
    it('should get configuration value', () => {
      mockWorkspaceConfig.get.mockReturnValue('test-value');
      
      const value = configService.get<string>('someKey');
      
      expect(value).toBe('test-value');
      expect(mockWorkspaceConfig.get).toHaveBeenCalledWith('someKey', undefined);
    });

    it('should use default value', () => {
      mockWorkspaceConfig.get.mockImplementation((key, defaultValue) => defaultValue);
      
      const value = configService.get<string>('someKey', 'default');
      
      expect(value).toBe('default');
    });

    it('should work with different types', () => {
      mockWorkspaceConfig.get.mockReturnValue(42);
      
      const value = configService.get<number>('numberKey');
      
      expect(value).toBe(42);
    });
  });

  describe('Generic Set', () => {
    it('should set configuration value', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.set('someKey', 'test-value');
      
      expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
        'someKey',
        'test-value',
        vscode.ConfigurationTarget.Global
      );
    });

    it('should work with different types', async () => {
      mockWorkspaceConfig.update.mockResolvedValue(undefined);
      
      await configService.set('numberKey', 42);
      
      expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
        'numberKey',
        42,
        vscode.ConfigurationTarget.Global
      );
    });
  });

  describe('Configuration Section', () => {
    it('should use correct configuration section', () => {
      configService.get('test');
      
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('zgxToolkit');
    });
  });
});
