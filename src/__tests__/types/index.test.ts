/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as Types from '../../types';

describe('types barrel export', () => {
    it('re-exports members from all type modules', () => {
        expect(Types.ViewIds).toBeDefined();
        expect(Types.ViewIds.MACHINE_LIST).toBe('devices/list');
    });
});
