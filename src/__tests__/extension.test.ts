/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { activate, deactivate, resetActivationState } from '../extension';
import { extensionStateService } from '../services/extensionStateService';
import { telemetryService } from '../services/telemetryService';
import { configService } from '../services/configService';
import { TelemetryEventType } from '../types/telemetry';

// Mock the providers
jest.mock('../providers/zgxToolkitProvider');

// Mock extensionStateService
jest.mock('../services/extensionStateService', () => ({
  extensionStateService: {
    initialize: jest.fn(),
    isFirstRun: jest.fn().mockReturnValue(false),
    setFirstRun: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock telemetryService
jest.mock('../services/telemetryService', () => ({
  telemetryService: {
    setEnabled: jest.fn(),
    trackEvent: jest.fn(),
    dispose: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock configService
jest.mock('../services/configService', () => ({
  configService: {
    getLogLevel: jest.fn().mockReturnValue('info'),
    getTelemetryEnabled: jest.fn().mockReturnValue(true),
  },
}));

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    // Reset activation state before each test
    resetActivationState();
    
    mockContext = {
      subscriptions: [] as any[],
      extensionUri: vscode.Uri.file('/mock/extension/path'),
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      globalState: {
        get: jest.fn().mockReturnValue([]),
        update: jest.fn(),
      },
      extensionPath: '/mock/extension/path',
      storagePath: '/mock/storage/path',
      globalStoragePath: '/mock/global/storage/path',
      logPath: '/mock/log/path',
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
      } as any,
      environmentVariableCollection: {} as any,
      asAbsolutePath: jest.fn(),
      storageUri: vscode.Uri.file('/mock/storage'),
      globalStorageUri: vscode.Uri.file('/mock/global/storage'),
      logUri: vscode.Uri.file('/mock/log'),
      extensionMode: 1,
      extension: {
        packageJSON: {
          name: 'test-extension',
          version: '1.0.0'
        }
      }
    } as any;

    // Clear all mocks before each test
    jest.clearAllMocks();
    (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
  });

  describe('activate', () => {
    it('should activate the extension successfully', async () => {
      await activate(mockContext);

      // Verify subscriptions were added
      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register webview provider', async () => {
      const registerWebviewViewProviderSpy = jest.spyOn(
        vscode.window,
        'registerWebviewViewProvider'
      );

      await activate(mockContext);

      // Verify webview provider registration
      expect(registerWebviewViewProviderSpy).toHaveBeenCalledWith(
        'remoteDevicesList',
        expect.anything()
      );
    });

    it('should register all commands', async () => {
      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

      await activate(mockContext);

      // Verify command registrations
      expect(registerCommandSpy).toHaveBeenCalled();
      
      // Check for key commands
      const commandIds = registerCommandSpy.mock.calls.map(call => call[0]);
      expect(commandIds).toContain('zgxToolkit.setLogLevel');
      expect(commandIds).toContain('zgxToolkit.toggleTelemetry');
      expect(commandIds).toContain('zgxToolkit.showTelemetryStatus');
    });

    it('should add subscriptions to context', async () => {
      await activate(mockContext);

      // Verify that subscriptions were added (webview provider + commands)
      expect(mockContext.subscriptions.length).toBeGreaterThanOrEqual(2);
    });

    it('should not activate twice', async () => {
      await activate(mockContext);
      const firstSubscriptionCount = mockContext.subscriptions.length;
      
      await activate(mockContext);
      const secondSubscriptionCount = mockContext.subscriptions.length;
      
      // Should have the same number of subscriptions
      expect(secondSubscriptionCount).toBe(firstSubscriptionCount);
    });

    it('should track first activation when extension runs for first time', async () => {
      (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(true);
      
      await activate(mockContext);
      
      expect(extensionStateService.isFirstRun).toHaveBeenCalled();
      expect(extensionStateService.setFirstRun).toHaveBeenCalledWith(true);
    });

    it('should track regular activation when extension has run before', async () => {
      (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
      
      await activate(mockContext);
      
      expect(extensionStateService.isFirstRun).toHaveBeenCalled();
      expect(extensionStateService.setFirstRun).not.toHaveBeenCalled();
    });
  });

  describe('Telemetry tracking', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      resetActivationState();
    });

    it('should track activation event with version on first run', async () => {
      (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(true);
      
      await activate(mockContext);
      
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Extension,
        action: 'firstActivation',
        properties: {
          version: '1.0.0'
        }
      });
      expect(extensionStateService.setFirstRun).toHaveBeenCalledWith(true);
    });

    it('should track activation event with version on subsequent runs', async () => {
      (extensionStateService.isFirstRun as jest.Mock).mockReturnValue(false);
      
      await activate(mockContext);
      
      expect(telemetryService.trackEvent).toHaveBeenCalledWith({
        eventType: TelemetryEventType.Extension,
        action: 'activate',
        properties: {
          version: '1.0.0'
        }
      });
      expect(extensionStateService.setFirstRun).not.toHaveBeenCalled();
    });

    it('should enable telemetry when both VS Code and extension settings are enabled', async () => {
      (vscode.env.isTelemetryEnabled as any) = true;
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
      await activate(mockContext);
      
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should disable telemetry when VS Code telemetry is disabled', async () => {
      (vscode.env.isTelemetryEnabled as any) = false;
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      
      await activate(mockContext);
      
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
    });

    it('should disable telemetry when extension telemetry setting is disabled', async () => {
      (vscode.env.isTelemetryEnabled as any) = true;
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      
      await activate(mockContext);
      
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
    });

    it('should update telemetry state when VS Code telemetry setting changes', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(true);
      let telemetryChangeHandler: ((enabled: boolean) => void) | undefined;
      
      // Capture the onDidChangeTelemetryEnabled handler
      (vscode.env.onDidChangeTelemetryEnabled as jest.Mock).mockImplementation((handler) => {
        telemetryChangeHandler = handler;
        return { dispose: jest.fn() };
      });
      
      await activate(mockContext);
      
      // Simulate VS Code telemetry being disabled
      telemetryChangeHandler?.(false);
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
      
      // Simulate VS Code telemetry being enabled
      telemetryChangeHandler?.(true);
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should respect extension telemetry setting when VS Code setting changes', async () => {
      (configService.getTelemetryEnabled as jest.Mock).mockReturnValue(false);
      let telemetryChangeHandler: ((enabled: boolean) => void) | undefined;
      
      (vscode.env.onDidChangeTelemetryEnabled as jest.Mock).mockImplementation((handler) => {
        telemetryChangeHandler = handler;
        return { dispose: jest.fn() };
      });
      
      await activate(mockContext);
      
      // Even if VS Code enables telemetry, it should remain disabled if extension setting is false
      telemetryChangeHandler?.(true);
      expect(telemetryService.setEnabled).toHaveBeenCalledWith(false);
    });

    it('should dispose telemetry service on cleanup', async () => {
      await activate(mockContext);
      
      // Find the telemetry dispose subscription
      const telemetryDisposable = mockContext.subscriptions.find(
        sub => sub.dispose && sub.dispose.toString().includes('telemetryService')
      );
      
      expect(telemetryDisposable).toBeDefined();
      
      // Call dispose
      await telemetryDisposable?.dispose();
      
      expect(telemetryService.dispose).toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('should deactivate without errors', () => {
      // deactivate function should complete without throwing
      expect(() => deactivate()).not.toThrow();
    });

    it('should be a function', () => {
      expect(typeof deactivate).toBe('function');
    });
  });
});