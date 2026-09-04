/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ViewIds } from '../../types/views';

describe('views types', () => {
    it('defines the expected view identifiers', () => {
        expect(ViewIds).toEqual({
            MACHINE_LIST: 'devices/list',
            MACHINE_DETAILS: 'devices/details',
            MACHINE_CREATE: 'devices/create',
            MACHINE_EDIT: 'devices/edit',
            MACHINE_APPS: 'devices/apps',
            SSH_KEY_SETUP: 'ssh/setup',
            DISCOVERY: 'discovery',
            ERROR: 'common/error',
            LOADING: 'common/loading'
        });
    });
});
