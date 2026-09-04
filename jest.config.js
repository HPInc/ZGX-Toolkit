/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.test.ts'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/src/__tests__/integrationSuite/',
        '<rootDir>/node_modules/',
        '/dist/'
    ],
    transform: {
        // 151002: nodenext module warning is a false positive here; type checking is still fully enabled.
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', diagnostics: { ignoreCodes: [151002] } }]
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/__tests__/**/*',
        '!src/__mocks__/**/*'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'html',
        'cobertura',
        'lcov'
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/__mocks__/vscode',
        // Strip the explicit .js extension required by nodenext resolution in source
        // so Jest can resolve relative imports back to their .ts source files.
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    clearMocks: true
};  