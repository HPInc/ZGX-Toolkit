/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Tests for the store barrel export.
 */

import { deviceStore, DeviceStore, groupStore, GroupStore } from '../../store';

describe('store barrel export', () => {
    it('re-exports the deviceStore singleton and DeviceStore class', () => {
        expect(deviceStore).toBeInstanceOf(DeviceStore);
    });

    it('re-exports the groupStore singleton and GroupStore class', () => {
        expect(groupStore).toBeInstanceOf(GroupStore);
    });
});
