/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the Logger utility.
 */

import { Logger } from '../../utils/logger';
import { LogLevel } from '../../types/logger';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock VS Code API
jest.mock('vscode');

describe('Logger', () => {
  let logger: Logger;
  let mockOutputChannel: jest.Mocked<vscode.OutputChannel>;
  let mockWriteStream: any;

  beforeEach(() => {
    // Create mock output channel
    mockOutputChannel = {
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    } as any;

    // Create mock write stream
    mockWriteStream = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Mock createOutputChannel
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

    // Update fs mock for this test
    (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);

    // Get logger instance
    logger = Logger.getInstance();
    
    // Reset log level to INFO
    logger.setLevel(LogLevel.INFO);
    
    // Clear mock calls
    mockOutputChannel.appendLine.mockClear();
    mockWriteStream.write.mockClear();
  });

  afterEach(() => {
    // Clear singleton instance
    (logger as any).constructor.instance = null;
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Log Level Management', () => {
    it('should set and get log level', () => {
      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should log INFO message when setting log level', () => {
      mockOutputChannel.appendLine.mockClear();
      logger.setLevel(LogLevel.TRACE);
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[INFO]');
      expect(logMessage).toContain('Log level set to Trace');
    });
  });

  describe('Error Logging', () => {
    it('should log error messages', () => {
      logger.error('Test error');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[ERROR]');
      expect(logMessage).toContain('Test error');
    });

    it('should log error messages with context', () => {
      logger.error('Test error', { code: 'ERR001', details: 'Something went wrong' });
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('ERR001');
      expect(logMessage).toContain('Something went wrong');
    });

    it('should always log errors regardless of log level', () => {
      logger.setLevel(LogLevel.ERROR);
      mockOutputChannel.appendLine.mockClear();
      mockWriteStream.write.mockClear();
      
      logger.error('Error message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should write errors to file', () => {
      logger.error('Test error');
      
      expect(mockWriteStream.write).toHaveBeenCalled();
      const logMessage = mockWriteStream.write.mock.calls[0][0];
      expect(logMessage).toContain('[ERROR]');
      expect(logMessage).toContain('Test error');
    });
  });

  describe('Warn Logging', () => {
    it('should log warn messages at WARN level', () => {
      logger.setLevel(LogLevel.WARN);
      logger.warn('Test warning');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[WARN]');
      expect(logMessage).toContain('Test warning');
    });

    it('should not log warn messages at ERROR level', () => {
      logger.setLevel(LogLevel.ERROR);
      mockOutputChannel.appendLine.mockClear();
      
      logger.warn('Test warning');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('Info Logging', () => {
    it('should log info messages at INFO level', () => {
      logger.setLevel(LogLevel.INFO);
      mockOutputChannel.appendLine.mockClear();
      
      logger.info('Test info');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[INFO]');
      expect(logMessage).toContain('Test info');
    });

    it('should not log info messages at WARN level', () => {
      logger.setLevel(LogLevel.WARN);
      mockOutputChannel.appendLine.mockClear();
      
      logger.info('Test info');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('Debug Logging', () => {
    it('should log debug messages at DEBUG level', () => {
      logger.setLevel(LogLevel.DEBUG);
      mockOutputChannel.appendLine.mockClear();
      
      logger.debug('Test debug');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[DEBUG]');
      expect(logMessage).toContain('Test debug');
    });

    it('should not log debug messages at INFO level', () => {
      logger.setLevel(LogLevel.INFO);
      mockOutputChannel.appendLine.mockClear();
      
      logger.debug('Test debug');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('Trace Logging', () => {
    it('should log trace messages at TRACE level', () => {
      logger.setLevel(LogLevel.TRACE);
      mockOutputChannel.appendLine.mockClear();
      
      logger.trace('Test trace');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[TRACE]');
      expect(logMessage).toContain('Test trace');
    });

    it('should not log trace messages at DEBUG level', () => {
      logger.setLevel(LogLevel.DEBUG);
      mockOutputChannel.appendLine.mockClear();
      
      logger.trace('Test trace');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('Context Sanitization', () => {
    it('should redact sensitive keys', () => {
      logger.error('Test error', { 
        password: 'secret123',
        token: 'abc123',
        normalKey: 'normal value'
      });
      
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[REDACTED]');
      expect(logMessage).not.toContain('secret123');
      expect(logMessage).not.toContain('abc123');
      expect(logMessage).toContain('normal value');
    });

    it('should handle Error objects in context', () => {
      const error = new Error('Test error object');
      logger.error('Test error', { error });
      
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('Test error object');
    });

    it('should handle nested objects', () => {
      logger.error('Test error', {
        level1: {
          level2: {
            password: 'secret',
            data: 'visible'
          }
        }
      });
      
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(logMessage).toContain('[REDACTED]');
      expect(logMessage).toContain('visible');
      expect(logMessage).not.toContain('secret');
    });
  });

  describe('Show Method', () => {
    it('should show the output channel', () => {
      logger.show();
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });
  });

  describe('Log File Path', () => {
    it('should set and get log file path', () => {
      const path = '/path/to/log.txt';
      logger.setLogFilePath(path);
      expect(logger.getLogFilePath()).toBe(path);
    });
  });

  describe('Timestamp Format', () => {
    it('should include ISO timestamp in log messages', () => {
      logger.info('Test message');
      
      const logMessage = mockOutputChannel.appendLine.mock.calls[0][0];
      // Check for ISO 8601 timestamp format
      expect(logMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('File Logging', () => {
    it('should initialize log file on creation', () => {
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should write to both output channel and file', () => {
      logger.info('Test message');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      expect(mockWriteStream.write).toHaveBeenCalled();
    });

    it('should rotate log file when date changes', () => {
      // Clear the singleton instance to force a fresh logger
      (logger as any).constructor.instance = null;
      
      // Clear all mock calls first
      jest.clearAllMocks();
      
      // Mock an existing log file from yesterday
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
        return path.includes('.zgx-toolkit') && path.endsWith('zgx-toolkit.log');
      });
      
      (fs.statSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('zgx-toolkit.log')) {
          return { 
            size: 1024,
            mtime: yesterday
          };
        }
        return { size: 0, mtime: new Date() };
      });
      
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      // Create new logger instance which should trigger rotation during initialization
      const newLogger = Logger.getInstance();
      
      // Should have renamed the old file with date suffix during initialization
      expect(fs.renameSync).toHaveBeenCalled();
    });

   it('should keep last 3 daily log files during rotation', () => {
      // Clear the singleton instance to force a fresh logger
      (logger as any).constructor.instance = null;
      
      // Clear all mock calls first
      jest.clearAllMocks();
      
      // Mock multiple archived log files exist
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});
      
      // Mock an old log file that needs rotation
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      (fs.statSync as jest.Mock).mockReturnValue({ 
        size: 1024,
        mtime: yesterday
      });
      
      // Generate test file dates based on yesterday
      const fileDate1 = new Date(yesterday.getTime() - 5 * 24 * 60 * 60 * 1000); // 6 days ago
      const fileDate2 = new Date(yesterday.getTime() - 4 * 24 * 60 * 60 * 1000); // 5 days ago
      const fileDate3 = new Date(yesterday.getTime() - 3 * 24 * 60 * 60 * 1000); // 4 days ago
      const fileDate4 = new Date(yesterday.getTime() - 2 * 24 * 60 * 60 * 1000); // 3 days ago (should be kept)
      const fileDate5 = new Date(yesterday.getTime() - 1 * 24 * 60 * 60 * 1000); // 2 days ago (should be kept)
      const fileDate6 = new Date(yesterday.getTime() - 0 * 24 * 60 * 60 * 1000); // 1 day ago (should be kept)
      
      // Mock directory listing with old archived files
      const oldFiles = [
        `zgx-toolkit-${fileDate1.toISOString().split('T')[0]}.log`,
        `zgx-toolkit-${fileDate2.toISOString().split('T')[0]}.log`,
        `zgx-toolkit-${fileDate3.toISOString().split('T')[0]}.log`,
        `zgx-toolkit-${fileDate4.toISOString().split('T')[0]}.log`, // Should be kept
        `zgx-toolkit-${fileDate5.toISOString().split('T')[0]}.log`, // Should be kept
        `zgx-toolkit-${fileDate6.toISOString().split('T')[0]}.log`  // Should be kept
      ];
      
      (fs.readdirSync as jest.Mock).mockImplementation((path: string) => oldFiles);
      
      // Mock statSync for each file to return different dates
      (fs.statSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.endsWith('zgx-toolkit.log')) return {mtime: yesterday}
        if (filePath.includes(fileDate1.toISOString().split('T')[0])) return { mtime: fileDate1 };
        if (filePath.includes(fileDate2.toISOString().split('T')[0])) return { mtime: fileDate2 };
        if (filePath.includes(fileDate3.toISOString().split('T')[0])) return { mtime: fileDate3 };
        if (filePath.includes(fileDate4.toISOString().split('T')[0])) return { mtime: fileDate4 };
        if (filePath.includes(fileDate5.toISOString().split('T')[0])) return { mtime: fileDate5 };
        if (filePath.includes(fileDate6.toISOString().split('T')[0])) return { mtime: fileDate6 };
        // Default for the main log file
        return { mtime: yesterday, size: 1024 };
      });

      // Trigger rotation by creating new logger
      const newLogger = Logger.getInstance();
      
      // Should have deleted the 3 oldest files (keeping last 3)
      expect(fs.unlinkSync).toHaveBeenCalledTimes(6); // This will be called 6 times (3 during init, 3 during a log write)
    });

    it('should handle file logging errors gracefully', () => {
      // Mock console.error to avoid cluttering test output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      mockWriteStream.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      expect(() => {
        logger.info('Test message');
      }).not.toThrow();

      // Should still write to output channel
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();

      // Should have logged the error to console
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to write to log file:', expect.any(Error));

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Disposal', () => {
    it('should close file stream on dispose', () => {
      logger.dispose();
      
      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('should dispose output channel on dispose', () => {
      logger.dispose();
      
      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });
  });
});
