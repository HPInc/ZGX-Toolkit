/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Canonical view ID strings for the setup flow.
 * These are the single source of truth — each controller's viewId() returns from here.
 * Import directly from this file when a static import of the target controller would
 * create a circular dependency (e.g. detectDeviceTypeViewController → manualSetupViewController).
 */
export const SETUP_VIEW_IDS = {
    automatic: 'setup/automatic',
    manual: 'setup/manual',
    detectDeviceType: 'setup/detectDeviceType',
    dnsRegistration: 'setup/dnsRegistration',
    options: 'setup/options',
    success: 'setup/success'
} as const;
