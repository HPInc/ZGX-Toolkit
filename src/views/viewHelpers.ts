/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Common helper functions for views to reduce code duplication
 * and ensure consistency across the view layer.
 */

import { Logger } from '../utils/logger';

/**
 * Sanitize HTML string to prevent XSS attacks
 * @param html The HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Escape HTML attributes to prevent injection
 * @param value The attribute value to escape
 * @returns Escaped attribute value
 */
export function escapeAttribute(value: string): string {
    return value
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Format a device/device name for display
 * Truncates long names and adds ellipsis
 * @param name The device name
 * @param maxLength Maximum length (default 30)
 * @returns Formatted name
 */
export function formatDeviceName(name: string, maxLength: number = 30): string {
    if (name.length <= maxLength) {
        return name;
    }
    return name.substring(0, maxLength - 3) + '...';
}

/**
 * Format a host address for display
 * @param host The host address
 * @param username Optional username
 * @param port Optional port
 * @returns Formatted host string
 */
export function formatHostAddress(host: string, username?: string, port?: number): string {
    let result = '';
    
    if (username) {
        result += `${username}@`;
    }
    
    result += host;
    
    if (port && port !== 22) {
        result += `:${port}`;
    }
    
    return result;
}

/**
 * Format a timestamp for display
 * @param timestamp ISO timestamp string
 * @returns Human-readable time string
 */
export function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
        }
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Generate a unique ID for DOM elements
 * @param prefix Optional prefix
 * @returns Unique ID string
 */
export function generateElementId(prefix: string = 'el'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate that required fields are present in data
 * @param data The data object to validate
 * @param requiredFields Array of required field names
 * @throws Error if validation fails
 */
export function validateRequiredFields(data: any, requiredFields: string[]): void {
    const missing = requiredFields.filter(field => !(field in data) || data[field] === null || data[field] === undefined);
    
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
}

/**
 * Create a performance timer for measuring operation duration
 * @param logger Logger instance
 * @param operationName Name of the operation being timed
 * @returns Object with stop() method that logs the duration
 */
export function createPerformanceTimer(logger: Logger, operationName: string) {
    const startTime = Date.now();
    
    return {
        stop: () => {
            const duration = Date.now() - startTime;
            if (duration > 100) {
                logger.warn(`Slow operation detected: ${operationName}`, { duration });
            } else {
                logger.trace(`Operation completed: ${operationName}`, { duration });
            }
            return duration;
        }
    };
}

/**
 * Create a retry wrapper for async operations
 * @param operation The async operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Delay between retries in milliseconds
 * @param logger Logger instance for logging retry attempts
 * @returns Promise that resolves with the operation result
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    logger?: Logger
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            
            if (logger) {
                logger.warn(`Operation failed, attempt ${attempt}/${maxRetries}`, {
                    error: lastError.message
                });
            }
            
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    throw lastError || new Error('Operation failed after retries');
}

/**
 * Check if a value is a valid URL
 * @param value The value to check
 * @returns True if the value is a valid URL
 */
export function isValidUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a value is a valid IPv4 address
 * @param value The value to check
 * @returns True if the value is a valid IPv4 address
 */
export function isValidIPv4(value: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(value);
}

/**
 * Check if a value is a valid port number
 * @param value The value to check
 * @returns True if the value is a valid port number
 */
export function isValidPort(value: number): boolean {
    return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * Safely parse JSON with error handling
 * @param json The JSON string to parse
 * @param defaultValue Default value to return on error
 * @returns Parsed JSON or default value
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return defaultValue;
    }
}

/**
 * Deep clone an object
 * @param obj The object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime()) as any;
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item)) as any;
    }
    
    if (obj instanceof Object) {
        const clonedObj = {} as T;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
    
    return obj;
}
