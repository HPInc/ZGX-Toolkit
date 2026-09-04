/*
 * Copyright ©2025-2026 HP Development Company, L.P.
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
                update: jest.fn()
            }
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

    describe('ZRT Announcement Tracking', () => {
        describe('hasSeenZrtAnnouncement', () => {
            it('should return true (safe default) when service is not initialized', () => {
                expect(service.hasSeenZrtAnnouncement()).toBe(true);
            });

            it('should return false when the announcement has not been seen', () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue(false);

                const result = service.hasSeenZrtAnnouncement();

                expect(result).toBe(false);
                expect(mockContext.globalState.get).toHaveBeenCalledWith('zrtAnnouncementSeen', false);
            });

            it('should return true when the announcement has already been seen', () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue(true);

                const result = service.hasSeenZrtAnnouncement();

                expect(result).toBe(true);
            });
        });

        describe('setZrtAnnouncementSeen', () => {
            it('should throw error when calling before initialization', async () => {
                await expect(service.setZrtAnnouncementSeen()).rejects.toThrow('ExtensionStateService not initialized');
            });

            it('should mark the announcement as seen', async () => {
                service.initialize(mockContext);
                mockContext.globalState.update = jest.fn().mockResolvedValue(undefined);

                await service.setZrtAnnouncementSeen();

                expect(mockContext.globalState.update).toHaveBeenCalledWith('zrtAnnouncementSeen', true);
            });

            it('should handle update errors', async () => {
                service.initialize(mockContext);
                const error = new Error('Update failed');
                mockContext.globalState.update = jest.fn().mockRejectedValue(error);

                await expect(service.setZrtAnnouncementSeen()).rejects.toThrow('Update failed');
            });
        });
    });

    describe('Quick Link Badge Tracking', () => {
        describe('hasSeenQuickLinkBadge', () => {
            it('should return true (safe default) when service is not initialized', () => {
                expect(service.hasSeenQuickLinkBadge('zrt-info')).toBe(true);
            });

            it('should return false when the badge has not been seen', () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({});

                const result = service.hasSeenQuickLinkBadge('zrt-info');

                expect(result).toBe(false);
                expect(mockContext.globalState.get).toHaveBeenCalledWith('quickLinkBadgesSeen', {});
            });

            it('should return true when the badge has already been seen', () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({ 'zrt-info': true });

                const result = service.hasSeenQuickLinkBadge('zrt-info');

                expect(result).toBe(true);
            });

            it('should track different quick links independently', () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({ 'zrt-info': true });

                expect(service.hasSeenQuickLinkBadge('zrt-info')).toBe(true);
                expect(service.hasSeenQuickLinkBadge('some-new-link')).toBe(false);
            });
        });

        describe('setQuickLinkBadgeSeen', () => {
            it('should throw error when calling before initialization', async () => {
                await expect(service.setQuickLinkBadgeSeen('zrt-info')).rejects.toThrow('ExtensionStateService not initialized');
            });

            it('should mark the badge as seen', async () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({});
                mockContext.globalState.update = jest.fn().mockResolvedValue(undefined);

                await service.setQuickLinkBadgeSeen('zrt-info');

                expect(mockContext.globalState.update).toHaveBeenCalledWith('quickLinkBadgesSeen', { 'zrt-info': true });
            });

            it('should preserve other quick links already marked as seen', async () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({ 'other-link': true });
                mockContext.globalState.update = jest.fn().mockResolvedValue(undefined);

                await service.setQuickLinkBadgeSeen('zrt-info');

                expect(mockContext.globalState.update).toHaveBeenCalledWith('quickLinkBadgesSeen', { 'other-link': true, 'zrt-info': true });
            });

            it('should handle update errors', async () => {
                service.initialize(mockContext);
                mockContext.globalState.get = jest.fn().mockReturnValue({});
                const error = new Error('Update failed');
                mockContext.globalState.update = jest.fn().mockRejectedValue(error);

                await expect(service.setQuickLinkBadgeSeen('zrt-info')).rejects.toThrow('Update failed');
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
