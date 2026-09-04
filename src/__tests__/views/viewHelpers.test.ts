/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import {
    sanitizeHtml,
    escapeAttribute,
    formatDeviceName,
    formatHostAddress,
    formatTimestamp,
    generateElementId,
    validateRequiredFields,
    createPerformanceTimer,
    retryOperation,
    isValidUrl,
    isValidIPv4,
    isValidPort,
    safeJsonParse,
    deepClone
} from '../../views/viewHelpers';

function createMockLogger() {
    return {
        setLevel: jest.fn(),
        getLevel: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn()
    };
}

describe('viewHelpers', () => {
    describe('sanitizeHtml', () => {
        it('should escape HTML special characters', () => {
            const input = '<script>alert("xss")</script>';
            const output = sanitizeHtml(input);
            expect(output).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
        });

        it('should escape ampersands', () => {
            const input = 'Tom & Jerry';
            const output = sanitizeHtml(input);
            expect(output).toBe('Tom &amp; Jerry');
        });
    });

    describe('escapeAttribute', () => {
        it('should escape quotes in attributes', () => {
            const input = 'My "special" value';
            const output = escapeAttribute(input);
            expect(output).toBe('My &quot;special&quot; value');
        });
    });

    describe('formatDeviceName', () => {
        it('should not truncate short names', () => {
            const name = 'TestDevice';
            expect(formatDeviceName(name)).toBe('TestDevice');
        });

        it('should truncate long names', () => {
            const name = 'ThisIsAVeryLongDeviceNameThatNeedsTruncation';
            const result = formatDeviceName(name, 20);
            expect(result).toBe('ThisIsAVeryLongDe...');
            expect(result.length).toBe(20);
        });
    });

    describe('formatHostAddress', () => {
        it('should format host only', () => {
            expect(formatHostAddress('192.168.1.1')).toBe('192.168.1.1');
        });

        it('should format with username', () => {
            expect(formatHostAddress('192.168.1.1', 'user')).toBe('user@192.168.1.1');
        });

        it('should format with non-default port', () => {
            expect(formatHostAddress('192.168.1.1', 'user', 2222)).toBe('user@192.168.1.1:2222');
        });

        it('should not show default port 22', () => {
            expect(formatHostAddress('192.168.1.1', 'user', 22)).toBe('user@192.168.1.1');
        });
    });

    describe('formatTimestamp', () => {
        it('should format recent timestamps', () => {
            const now = new Date();
            const result = formatTimestamp(now.toISOString());
            expect(result).toBe('just now');
        });

        it('should format minutes ago', () => {
            const past = new Date(Date.now() - 5 * 60 * 1000);
            const result = formatTimestamp(past.toISOString());
            expect(result).toBe('5 minutes ago');
        });

        it('should format hours ago', () => {
            const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const result = formatTimestamp(past.toISOString());
            expect(result).toBe('3 hours ago');
        });

        it('should handle invalid timestamps', () => {
            const result = formatTimestamp('invalid');
            expect(result).toBe('Unknown');
        });

        it('should format days ago', () => {
            const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            const result = formatTimestamp(past.toISOString());
            expect(result).toBe('3 days ago');
        });

        it('should format singular day ago', () => {
            const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 60 * 1000);
            const result = formatTimestamp(past.toISOString());
            expect(result).toBe('1 day ago');
        });

        it('should fall back to locale date string beyond 7 days', () => {
            const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            const result = formatTimestamp(past.toISOString());
            expect(result).toBe(past.toLocaleDateString());
        });
    });

    describe('generateElementId', () => {
        it('should generate unique IDs', () => {
            const id1 = generateElementId();
            const id2 = generateElementId();
            expect(id1).not.toBe(id2);
        });

        it('should use custom prefix', () => {
            const id = generateElementId('btn');
            expect(id).toMatch(/^btn-/);
        });
    });

    describe('validateRequiredFields', () => {
        it('should pass validation with all fields present', () => {
            const data = { name: 'Test', host: '192.168.1.1' };
            expect(() => {
                validateRequiredFields(data, ['name', 'host']);
            }).not.toThrow();
        });

        it('should throw error for missing fields', () => {
            const data = { name: 'Test' };
            expect(() => {
                validateRequiredFields(data, ['name', 'host']);
            }).toThrow('Missing required fields: host');
        });

        it('should throw error for null fields', () => {
            const data = { name: 'Test', host: null };
            expect(() => {
                validateRequiredFields(data, ['name', 'host']);
            }).toThrow('Missing required fields: host');
        });
    });

    describe('createPerformanceTimer', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should log trace for fast operations', () => {
            const logger = createMockLogger();
            jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1050);

            const timer = createPerformanceTimer(logger as any, 'fastOp');
            const duration = timer.stop();

            expect(duration).toBe(50);
            expect(logger.trace).toHaveBeenCalledWith('Operation completed: fastOp', { duration: 50 });
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should log warn for slow operations', () => {
            const logger = createMockLogger();
            jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1200);

            const timer = createPerformanceTimer(logger as any, 'slowOp');
            const duration = timer.stop();

            expect(duration).toBe(200);
            expect(logger.warn).toHaveBeenCalledWith('Slow operation detected: slowOp', { duration: 200 });
            expect(logger.trace).not.toHaveBeenCalled();
        });
    });

    describe('retryOperation', () => {
        it('should resolve on the first attempt without retrying', async () => {
            const operation = jest.fn().mockResolvedValue('ok');

            const result = await retryOperation(operation, 3, 1);

            expect(result).toBe('ok');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry after a failure and log a warning before succeeding', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('fail1'))
                .mockResolvedValueOnce('recovered');
            const logger = createMockLogger();

            const result = await retryOperation(operation, 3, 1, logger as any);

            expect(result).toBe('recovered');
            expect(operation).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith('Operation failed, attempt 1/3', { error: 'fail1' });
        });

        it('should throw the last error after exhausting all retries', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('always fails'));
            const logger = createMockLogger();

            await expect(retryOperation(operation, 2, 1, logger as any)).rejects.toThrow('always fails');

            expect(operation).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith('Operation failed, attempt 2/2', { error: 'always fails' });
        });

        it('should retry without a logger provided', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValueOnce('done');

            const result = await retryOperation(operation, 2, 1);

            expect(result).toBe('done');
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('isValidUrl', () => {
        it('should validate correct URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('ftp://example.com')).toBe(true);
        });

        it('should reject invalid URLs', () => {
            expect(isValidUrl('not a url')).toBe(false);
            expect(isValidUrl('example.com')).toBe(false);
        });
    });

    describe('isValidIPv4', () => {
        it('should validate correct IPv4 addresses', () => {
            expect(isValidIPv4('192.168.1.1')).toBe(true);
            expect(isValidIPv4('10.0.0.1')).toBe(true);
            expect(isValidIPv4('255.255.255.255')).toBe(true);
        });

        it('should reject invalid IPv4 addresses', () => {
            expect(isValidIPv4('256.1.1.1')).toBe(false);
            expect(isValidIPv4('192.168.1')).toBe(false);
            expect(isValidIPv4('not an ip')).toBe(false);
        });
    });

    describe('isValidPort', () => {
        it('should validate correct ports', () => {
            expect(isValidPort(22)).toBe(true);
            expect(isValidPort(8080)).toBe(true);
            expect(isValidPort(65535)).toBe(true);
        });

        it('should reject invalid ports', () => {
            expect(isValidPort(0)).toBe(false);
            expect(isValidPort(-1)).toBe(false);
            expect(isValidPort(65536)).toBe(false);
            expect(isValidPort(22.5)).toBe(false);
        });
    });

    describe('safeJsonParse', () => {
        it('should parse valid JSON', () => {
            const json = '{"name":"test"}';
            const result = safeJsonParse(json, {});
            expect(result).toEqual({ name: 'test' });
        });

        it('should return default on invalid JSON', () => {
            const json = 'invalid json';
            const result = safeJsonParse(json, { default: true });
            expect(result).toEqual({ default: true });
        });
    });

    describe('deepClone', () => {
        it('should clone simple objects', () => {
            const obj = { name: 'test', value: 42 };
            const cloned = deepClone(obj);
            expect(cloned).toEqual(obj);
            expect(cloned).not.toBe(obj);
        });

        it('should clone nested objects', () => {
            const obj = { user: { name: 'test', age: 30 } };
            const cloned = deepClone(obj);
            expect(cloned).toEqual(obj);
            expect(cloned.user).not.toBe(obj.user);
        });

        it('should clone arrays', () => {
            const arr = [1, 2, { value: 3 }];
            const cloned = deepClone(arr);
            expect(cloned).toEqual(arr);
            expect(cloned).not.toBe(arr);
            expect(cloned[2]).not.toBe(arr[2]);
        });

        it('should clone dates', () => {
            const date = new Date();
            const cloned = deepClone(date);
            expect(cloned.getTime()).toBe(date.getTime());
            expect(cloned).not.toBe(date);
        });

        it('should return primitives unchanged', () => {
            expect(deepClone(42)).toBe(42);
            expect(deepClone('text')).toBe('text');
            expect(deepClone(null)).toBeNull();
        });

        it('should return objects with no prototype as-is via the fallback branch', () => {
            const obj = Object.create(null);
            obj.a = 1;
            const cloned = deepClone(obj);
            expect(cloned).toBe(obj);
        });
    });
});
