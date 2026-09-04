/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { APP_CATEGORIES, getAllApps, getAppById, getCategoryById } from '../../constants/apps';

describe('apps constants - getCategoryById', () => {
    it('returns the matching category', () => {
        const systemStack = getCategoryById('system-stack');

        expect(systemStack).toBeDefined();
        expect(systemStack?.id).toBe('system-stack');
    });

    it('returns undefined for an unknown category id', () => {
        expect(getCategoryById('does-not-exist')).toBeUndefined();
    });
});

describe('apps constants - snapd', () => {
    it('should be defined in the system-stack category', () => {
        const systemStack = APP_CATEGORIES.find(cat => cat.id === 'system-stack');
        expect(systemStack).toBeDefined();

        const snapd = systemStack?.apps.find(app => app.id === 'snapd');
        expect(snapd).toBeDefined();
    });

    it('should be retrievable via getAllApps', () => {
        const allApps = getAllApps();
        const snapd = allApps.find(app => app.id === 'snapd');

        expect(snapd).toBeDefined();
        expect(snapd?.name).toBe('snapd');
        expect(snapd?.category).toBe('system-stack');
    });

    it('should be retrievable via getAppById', () => {
        const snapd = getAppById('snapd');

        expect(snapd).toBeDefined();
        expect(snapd?.id).toBe('snapd');
    });

    it('should have an icon, description, and features consistent with other cards', () => {
        const snapd = getAppById('snapd');

        expect(snapd?.icon).toBeTruthy();
        expect(snapd?.description).toBeTruthy();
        expect(snapd?.features).toBeInstanceOf(Array);
        expect(snapd?.features?.length).toBeGreaterThan(0);
    });

    it('should have install, verify, and uninstall commands', () => {
        const snapd = getAppById('snapd');

        expect(snapd?.installCommand).toContain('apt install');
        expect(snapd?.installCommand).toContain('snapd');
        expect(snapd?.verifyCommand).toBe('snap --version');
        expect(snapd?.uninstallCommand).toContain('apt remove');
        expect(snapd?.uninstallCommand).toContain('snapd');
    });

    it('should require sudo for installation', () => {
        const snapd = getAppById('snapd');
        expect(snapd?.installCommand).toContain('sudo');
    });

    it('should not declare any dependencies (installable standalone via apt)', () => {
        const snapd = getAppById('snapd');
        expect(snapd?.dependencies).toBeUndefined();
    });
});

describe('apps constants - Model Serving / zrt', () => {
    it('should define a model-serving category targeted at zgx_fury device type', () => {
        const modelServing = APP_CATEGORIES.find(cat => cat.id === 'model-serving');

        expect(modelServing).toBeDefined();
        expect(modelServing?.deviceType).toBe('zgx_fury');
    });

    it('should be the first category in APP_CATEGORIES', () => {
        expect(APP_CATEGORIES[0].id).toBe('model-serving');
    });

    it('should contain the zrt app', () => {
        const modelServing = APP_CATEGORIES.find(cat => cat.id === 'model-serving');
        const zrt = modelServing?.apps.find(app => app.id === 'zrt');

        expect(zrt).toBeDefined();
    });

    it('should be retrievable via getAllApps and getAppById', () => {
        const allApps = getAllApps();
        expect(allApps.find(app => app.id === 'zrt')).toBeDefined();

        const zrt = getAppById('zrt');
        expect(zrt).toBeDefined();
        expect(zrt?.id).toBe('zrt');
    });

    it('should have an icon, description, and features', () => {
        const zrt = getAppById('zrt');

        expect(zrt?.icon).toBeTruthy();
        expect(zrt?.description).toBeTruthy();
        expect(zrt?.features).toBeInstanceOf(Array);
        expect(zrt?.features?.length).toBeGreaterThan(0);
    });

    it('should install via snap, verify via snap list plus the explicit binary path, and uninstall via snap remove', () => {
        const zrt = getAppById('zrt');

        expect(zrt?.installCommand).toContain('snap install');
        expect(zrt?.installCommand).toContain('--classic');
        expect(zrt?.installCommand).toContain('zrt');
        expect(zrt?.verifyCommand).toBe('snap list zrt && /snap/bin/zrt version');
        expect(zrt?.uninstallCommand).toContain('snap remove');
        expect(zrt?.uninstallCommand).toContain('zrt');
    });

    it('should verify via the explicit /snap/bin path rather than a bare "zrt" invocation (avoids PATH shadowing by a stale /usr/local/bin/zrt)', () => {
        const zrt = getAppById('zrt');

        expect(zrt?.verifyCommand).toContain('/snap/bin/zrt version');
    });

    it('should require sudo for installation', () => {
        const zrt = getAppById('zrt');
        expect(zrt?.installCommand).toContain('sudo');
    });

    it('should declare snapd as a dependency', () => {
        const zrt = getAppById('zrt');
        expect(zrt?.dependencies).toEqual(['snapd']);
    });
});
