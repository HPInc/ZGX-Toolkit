/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for the telemetry service.
 */

import { TelemetryService } from '../../services/telemetryService';
import { logger } from '../../utils/logger';
import { TelemetryEventType } from '../../types/telemetry';
import { APP_INSIGHTS_CONNS } from '../../constants/appInsights';

// Mock logger
jest.mock('../../utils/logger');

// Mock TelemetryReporter
const mockSendTelemetryEvent = jest.fn();
const mockSendTelemetryErrorEvent = jest.fn();
const mockDispose = jest.fn();

jest.mock('@vscode/extension-telemetry', () => ({
  TelemetryReporter: jest.fn().mockImplementation(() => ({
    sendTelemetryEvent: mockSendTelemetryEvent,
    sendTelemetryErrorEvent: mockSendTelemetryErrorEvent,
    dispose: mockDispose
  }))
}));

// Get reference to the mocked constructor
const { TelemetryReporter: MockedTelemetryReporter } = jest.requireMock('@vscode/extension-telemetry');

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;

  beforeEach(() => {
    MockedTelemetryReporter.mockClear();
    mockSendTelemetryEvent.mockClear();
    mockSendTelemetryErrorEvent.mockClear();
    mockDispose.mockClear();
    telemetryService = new TelemetryService();
    jest.clearAllMocks();
  });

  describe('Constructor - Connection String Selection', () => {
    const originalEnv = process.env.ZTK_TELEMETRY;

    afterEach(() => {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.ZTK_TELEMETRY = originalEnv;
      } else {
        delete process.env.ZTK_TELEMETRY;
      }
      MockedTelemetryReporter.mockClear();
      mockSendTelemetryEvent.mockClear();
      mockSendTelemetryErrorEvent.mockClear();
      mockDispose.mockClear();
    });

    it('should use PROD connection string by default when ZTK_TELEMETRY is not set', () => {
      delete process.env.ZTK_TELEMETRY;
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.PROD,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use DEV connection string when ZTK_TELEMETRY=dev', () => {
      process.env.ZTK_TELEMETRY = 'dev';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.DEV,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use QA connection string when ZTK_TELEMETRY=qa', () => {
      process.env.ZTK_TELEMETRY = 'qa';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.QA,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use HPER connection string when ZTK_TELEMETRY=hper', () => {
      process.env.ZTK_TELEMETRY = 'hper';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.HPER,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use PROD connection string when ZTK_TELEMETRY=prod', () => {
      process.env.ZTK_TELEMETRY = 'prod';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.PROD,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should be case insensitive - handle DEV', () => {
      process.env.ZTK_TELEMETRY = 'DEV';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.DEV,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should be case insensitive - handle QA', () => {
      process.env.ZTK_TELEMETRY = 'QA';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.QA,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should be case insensitive - handle HPER', () => {
      process.env.ZTK_TELEMETRY = 'HPER';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.HPER,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use PROD connection string for invalid environment value', () => {
      process.env.ZTK_TELEMETRY = 'invalid';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.PROD,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use PROD connection string for empty string', () => {
      process.env.ZTK_TELEMETRY = '';
      
      new TelemetryService();
      
      expect(MockedTelemetryReporter).toHaveBeenCalledWith(
        APP_INSIGHTS_CONNS.PROD,
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('Enabled State', () => {
    it('should start with telemetry disabled', () => {
      expect(telemetryService.isEnabled()).toBe(false);
    });

    it('should set enabled state', () => {
      telemetryService.setEnabled(true);
      expect(telemetryService.isEnabled()).toBe(true);

      telemetryService.setEnabled(false);
      expect(telemetryService.isEnabled()).toBe(false);
    });

    it('should log when enabled state changes', () => {
      telemetryService.setEnabled(true);
      expect(logger.debug).toHaveBeenCalledWith(
        'Telemetry enabled state changed',
        { enabled: true }
      );
    });
  });

  describe('Track Event', () => {
    it('should not throw', () => {
      expect(() => {
        telemetryService.trackEvent({
          eventType: TelemetryEventType.View,
          action: 'navigate',
          properties: { toView: 'test-view' }
        });
      }).not.toThrow();
    });

    it('should log trace message', () => {
      telemetryService.trackEvent({
        eventType: TelemetryEventType.Command,
        action: 'execute',
        properties: { commandId: 'test-command' }
      });
      expect(logger.trace).toHaveBeenCalledWith(
        'Telemetry: trackEvent',
        expect.any(Object)
      );
    });
  });



  describe('Track Error', () => {
    it('should not throw with Error object', () => {
      const error = new Error('Test error');
      expect(() => {
        telemetryService.trackError({
          eventType: TelemetryEventType.Error,
          error: error
        });
      }).not.toThrow();
    });

    it('should not throw with error string', () => {
      expect(() => {
        telemetryService.trackError({
          eventType: TelemetryEventType.Error,
          error: new Error('Error message')
        });
      }).not.toThrow();
    });

    it('should accept context parameter', () => {
      const error = new Error('Test error');
      expect(() => {
        telemetryService.trackError({
          eventType: TelemetryEventType.Error,
          error: error,
          context: 'test'
        });
      }).not.toThrow();
    });

    it('should log trace message', () => {
      const error = new Error('Test error');
      telemetryService.trackError({
        eventType: TelemetryEventType.Error,
        error: error
      });
      expect(logger.trace).toHaveBeenCalledWith(
        'Telemetry: trackError',
        expect.any(Object)
      );
    });

    it('should handle non-Error objects safely', () => {
      expect(() => {
        telemetryService.trackError({
          eventType: TelemetryEventType.Error,
          error: 'string error' as any
        });
      }).not.toThrow();
    });
  });

  describe('No Side Effects', () => {
    it('should not throw errors when called multiple times', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          telemetryService.trackEvent({
            eventType: TelemetryEventType.Command,
            action: 'execute',
            properties: { commandId: 'test' }
          });
          telemetryService.trackError({
            eventType: TelemetryEventType.Error,
            error: new Error('test')
          });
        }
      }).not.toThrow();
    });

    it('should handle undefined and null parameters gracefully', () => {
      expect(() => {
        telemetryService.trackEvent({
          eventType: TelemetryEventType.Command,
          action: 'execute',
          properties: { commandId: 'test' }
        });
        telemetryService.trackError({
          eventType: TelemetryEventType.Error,
          error: new Error('test'),
          context: undefined
        });
      }).not.toThrow();
    });
  });
});
