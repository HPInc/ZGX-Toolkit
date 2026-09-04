/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Unit tests for string utility functions.
 */

import { getLastChars } from '../../utils/string';

describe('getLastChars', () => {
    it('returns the entire string when shorter than the default limit', () => {
        const input = 'short string';
        expect(getLastChars(input)).toBe(input);
    });

    it('returns the entire string when exactly equal to the default limit', () => {
        const input = 'a'.repeat(500);
        expect(getLastChars(input)).toBe(input);
    });

    it('returns only the last 500 characters when longer than the default limit', () => {
        const input = 'a'.repeat(400) + 'b'.repeat(200);
        const result = getLastChars(input);
        expect(result).toHaveLength(500);
        expect(result).toBe('a'.repeat(300) + 'b'.repeat(200));
    });

    it('returns an empty string when given an empty string', () => {
        expect(getLastChars('')).toBe('');
    });

    it('respects a custom n parameter shorter than the string length', () => {
        expect(getLastChars('abcdefgh', 3)).toBe('fgh');
    });

    it('returns the entire string when n equals the string length', () => {
        expect(getLastChars('abcde', 5)).toBe('abcde');
    });

    it('returns the entire string when n is 0 because slice(-0) matches the whole string', () => {
        expect(getLastChars('abcde', 0)).toBe('abcde');
    });
});
