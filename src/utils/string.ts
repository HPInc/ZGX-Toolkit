/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Returns the last 500 characters of a string.
 * If the string is shorter than 500 characters, returns the entire string.
 * @param str - The input string
 * @returns The last 500 characters (or the entire string if shorter)
 */
export function getLastChars(str: string, n: number = 500): string {
    return str.length <= n ? str : str.slice(-n);
}