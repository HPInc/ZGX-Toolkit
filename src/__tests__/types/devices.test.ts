/*
 * Copyright ©2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { DeviceType, isInferenceDeviceType } from '../../types/devices';

describe('isInferenceDeviceType', () => {
    it('should return true for ZGX Fury', () => {
        expect(isInferenceDeviceType(DeviceType.ZGXFury)).toBe(true);
    });

    it('should return true for ZGX Nano', () => {
        expect(isInferenceDeviceType(DeviceType.ZGXNano)).toBe(true);
    });

    it('should return false for Z8', () => {
        expect(isInferenceDeviceType(DeviceType.Z8)).toBe(false);
    });

    it('should return false for Z4', () => {
        expect(isInferenceDeviceType(DeviceType.Z4)).toBe(false);
    });

    it('should return false for Z2', () => {
        expect(isInferenceDeviceType(DeviceType.Z2)).toBe(false);
    });

    it('should return false for Other', () => {
        expect(isInferenceDeviceType(DeviceType.Other)).toBe(false);
    });

    it('should return false for Unknown', () => {
        expect(isInferenceDeviceType(DeviceType.Unknown)).toBe(false);
    });

    it('should return false for Pending', () => {
        expect(isInferenceDeviceType(DeviceType.Pending)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isInferenceDeviceType(undefined)).toBe(false);
    });
});
