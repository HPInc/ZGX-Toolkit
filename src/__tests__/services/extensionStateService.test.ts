/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the extension state service.
 */

import { ExtensionStateService } from '../../services/extensionStateService';
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode');
jest.mock('../../utils/logger');

describe('ExtensionStateService', () => {
  let service: ExtensionStateService;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;

  beforeEach(() => {
    // Create mock extension context
    mockContext = {
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    service = new ExtensionStateService();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with context', () => {
      expect(() => service.initialize(mockContext)).not.toThrow();
    });

    it('should throw error when calling methods before initialization', () => {
      expect(() => service.isFirstRun()).toThrow('ExtensionStateService not initialized');
    });

    it('should throw error when calling setFirstRun before initialization', async () => {
      await expect(service.setFirstRun(true)).rejects.toThrow('ExtensionStateService not initialized');
    });
  });

  describe('First Run Tracking', () => {
    beforeEach(() => {
      service.initialize(mockContext);
    });

    describe('isFirstRun', () => {
      it('should return true when extension has not run before', () => {
        mockContext.globalState.get = jest.fn().mockReturnValue(false);
        
        const result = service.isFirstRun();
        
        expect(result).toBe(true);
        expect(mockContext.globalState.get).toHaveBeenCalledWith('hasRunBefore', false);
      });

      it('should return false when extension has run before', () => {
        mockContext.globalState.get = jest.fn().mockReturnValue(true);
        
        const result = service.isFirstRun();
        
        expect(result).toBe(false);
        expect(mockContext.globalState.get).toHaveBeenCalledWith('hasRunBefore', false);
      });

      it('should use false as default when value is not set', () => {
        mockContext.globalState.get = jest.fn().mockImplementation((key, defaultValue) => defaultValue);
        
        const result = service.isFirstRun();
        
        expect(result).toBe(true); // Default is false, so !false = true (first run)
      });
    });

    describe('setFirstRun', () => {
      it('should set first run state to true', async () => {
        mockContext.globalState.update = jest.fn().mockResolvedValue(undefined);
        
        await service.setFirstRun(true);
        
        expect(mockContext.globalState.update).toHaveBeenCalledWith('hasRunBefore', true);
      });

      it('should set first run state to false', async () => {
        mockContext.globalState.update = jest.fn().mockResolvedValue(undefined);
        
        await service.setFirstRun(false);
        
        expect(mockContext.globalState.update).toHaveBeenCalledWith('hasRunBefore', false);
      });

      it('should handle update errors', async () => {
        const error = new Error('Update failed');
        mockContext.globalState.update = jest.fn().mockRejectedValue(error);
        
        await expect(service.setFirstRun(true)).rejects.toThrow('Update failed');
      });
    });
  });

  describe('Multiple Instances', () => {
    it('should work correctly with multiple service instances', () => {
      const service1 = new ExtensionStateService();
      const service2 = new ExtensionStateService();
      
      service1.initialize(mockContext);
      service2.initialize(mockContext);
      
      mockContext.globalState.get = jest.fn().mockReturnValue(false);
      
      expect(service1.isFirstRun()).toBe(true);
      expect(service2.isFirstRun()).toBe(true);
    });
  });
});
