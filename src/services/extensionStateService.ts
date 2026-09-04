/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Extension state service for storing internal extension state.
 * 
 * This service manages non-user-configurable state that needs to persist
 * across VS Code sessions using globalState. Unlike configService (which
 * manages user settings).
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { GLOBAL_STATE_KEYS } from '../constants/globalState';

/**
 * Service for managing internal extension state in VS Code's globalState.
 */
class ExtensionStateService {
    private context?: vscode.ExtensionContext;

    /**
     * Initialize the extension state service with the extension context.
     * Must be called during extension activation before using any methods.
     * 
     * @param context Extension context for accessing globalState
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        logger.debug('Extension state service initialized');
    }

    /**
     * Check if this is the first run of the extension.
     * 
     * @returns True if this is the first run, false otherwise
     * @throws Error if service is not initialized
     */
    public isFirstRun(): boolean {
        this.ensureInitialized();
        const hasRun = this.context!.globalState.get<boolean>(GLOBAL_STATE_KEYS.HAS_RUN_BEFORE, false);
        return !hasRun;
    }

    /**
     * Mark whether the extension has run before.
     * 
     * @param hasRun True if the extension has run before, false to reset
     * @throws Error if service is not initialized
     */
    public async setFirstRun(hasRun: boolean): Promise<void> {
        this.ensureInitialized();
        await this.context!.globalState.update(GLOBAL_STATE_KEYS.HAS_RUN_BEFORE, hasRun);
        logger.debug('First run state updated', { hasRun });
    }

    /**
     * Check whether the user has already seen/dismissed the one-time HP Z Runtime (ZRT)
     * product announcement.
     *
     * @returns True if the announcement has already been shown and dismissed, false otherwise
     */
    public hasSeenZrtAnnouncement(): boolean {
        if (!this.context) {
            return true;
        }
        return this.context.globalState.get<boolean>(GLOBAL_STATE_KEYS.ZRT_ANNOUNCEMENT_SEEN, false);
    }

    /**
     * Mark the one-time HP Z Runtime (ZRT) product announcement as seen/dismissed so it is
     * not shown again.
     *
     * @throws Error if service is not initialized
     */
    public async setZrtAnnouncementSeen(): Promise<void> {
        this.ensureInitialized();
        await this.context!.globalState.update(GLOBAL_STATE_KEYS.ZRT_ANNOUNCEMENT_SEEN, true);
        logger.debug('ZRT announcement seen state updated', { seen: true });
    }

    /**
     * Check whether the user has already clicked a given Quick Links sidebar entry at least
     * once. Used to hide that entry's "New" badge after its first click.
     *
     * This is generic across all Quick Links entries: any new entry can call this with its
     * own unique `linkId` to get the same "New" badge behavior, without needing a dedicated
     * globalState key or service method of its own.
     *
     * @param linkId Unique identifier for the Quick Links entry (e.g. `'zrt-info'`)
     * @returns True if the quick link has already been clicked, false otherwise
     */
    public hasSeenQuickLinkBadge(linkId: string): boolean {
        if (!this.context) {
            return true;
        }
        const seenLinks = this.context.globalState.get<Record<string, boolean>>(GLOBAL_STATE_KEYS.QUICK_LINK_BADGES_SEEN, {});
        return seenLinks[linkId] ?? false;
    }

    /**
     * Mark a given Quick Links sidebar entry as seen so its "New" badge is no longer shown.
     *
     * @param linkId Unique identifier for the Quick Links entry (e.g. `'zrt-info'`)
     * @throws Error if service is not initialized
     */
    public async setQuickLinkBadgeSeen(linkId: string): Promise<void> {
        this.ensureInitialized();
        const seenLinks = this.context!.globalState.get<Record<string, boolean>>(GLOBAL_STATE_KEYS.QUICK_LINK_BADGES_SEEN, {});
        const updatedSeenLinks = { ...seenLinks, [linkId]: true };
        await this.context!.globalState.update(GLOBAL_STATE_KEYS.QUICK_LINK_BADGES_SEEN, updatedSeenLinks);
        logger.debug('Quick link badge seen state updated', { linkId, seen: true });
    }

    /**
     * Ensure the service has been initialized.
     * 
     * @throws Error if not initialized
     */
    private ensureInitialized(): void {
        if (!this.context) {
            throw new Error('ExtensionStateService not initialized. Call initialize() with ExtensionContext first.');
        }
    }
}

/**
 * Singleton extension state service instance.
 * 
 * @example
 * ```typescript
 * import { extensionStateService } from './services/extensionStateService';
 * 
 * // In activate():
 * extensionStateService.initialize(context);
 * 
 * // Check if first run:
 * if (extensionStateService.isFirstRun()) {
 *   // Mark that extension has run before. If this code is executing, then we have at least run once, by definition.
 *   await extensionStateService.setFirstRun(true);
 * }
 * ```
 */
export const extensionStateService = new ExtensionStateService();

/**
 * Export the class for testing purposes.
 */
export { ExtensionStateService };
