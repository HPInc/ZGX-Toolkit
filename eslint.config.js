import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import parser from '@typescript-eslint/parser';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig({
    ignores: ['eslint.config.js', 'jest.config.js'],
    files: ['**/*.{js,ts}'],
    extends: [
        js.configs.recommended,
        tseslint.configs.recommended,
        tseslint.configs.stylistic,
        {
            languageOptions: {
                parser: parser,
                globals: {
                    ...globals.browser,
                    ...globals.jest,
                    ...globals.node,
                    ...globals.mocha,
                    acquireVsCodeApi: 'readonly',
                }
            }
        },
    ],
    plugins: {
        '@stylistic': stylistic
    },
	rules: {
        "@typescript-eslint/naming-convention": [
            "error",
            {
                selector: 'default',
                format: ['camelCase'],
                leadingUnderscore: 'allow',
                trailingUnderscore: 'allow'
            },
            {
                selector: 'import',
                format: ['camelCase', 'PascalCase']
            },
            {
                selector: 'variable',
                // PascalCase covers const bindings that hold a class reference (dynamic imports)
                // and namespace-like constant objects (e.g. ViewIds)
                format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                leadingUnderscore: 'allow',
                trailingUnderscore: 'allow'
            },
            {
                selector: 'typeLike',
                format: ['PascalCase']
            },
            {
                selector: 'objectLiteralProperty',
                // covers external-facing keys (command ids, config/storage keys, string lookup tables)
                format: ['camelCase', 'UPPER_CASE', 'PascalCase']
            },
            {
                selector: 'enumMember',
                format: ['camelCase', 'UPPER_CASE', 'PascalCase']
            },
            {
                selector: 'classProperty',
                modifiers: ['readonly'],
                format: ['camelCase', 'UPPER_CASE']
            }
        ],
        "@typescript-eslint/no-unused-vars" : ["error", {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
        }],
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-empty-function": "error",
        "@typescript-eslint/no-require-imports": "error",
        "@typescript-eslint/no-inferrable-types": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/consistent-indexed-object-style": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/consistent-generic-constructors": "error",
        "@typescript-eslint/no-unsafe-function-type": "error",
        "@typescript-eslint/consistent-type-definitions": "error",
		curly: "off",
        eqeqeq: 'error',
        'no-throw-literal': 'error',
        semi: "off",
        'no-undef': "error",
        'no-case-declarations': "error",
        'no-prototype-builtins': "error",
        'no-useless-assignment': "error",
        'no-redeclare': "error",
        'prefer-const': "error",
        'preserve-caught-error': "error",
        '@stylistic/indent': ['error', 4],
        '@stylistic/semi': ['error', 'always'],
        '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
        '@stylistic/comma-dangle': ['error', 'never']
	},
}, {
    // TypeScript's own compiler already flags undefined identifiers; no-undef produces
    // false positives on ambient global types like NodeJS that only exist as TS types.
    files: ['**/*.ts'],
    rules: {
        'no-undef': 'off'
    }
}, {
    // Test/mock files legitimately need loose typing to mock external APIs (vscode, ssh2,
    // dns-sd): `any` for flexible mock signatures, `require()` for jest.doMock-based module
    // resets, empty jest.fn() stubs, and non-convention property keys (CSS selectors, kebab-case
    // external field names) in fake lookup objects.
    files: ['**/*.test.ts', '**/__mocks__/**', '**/__tests__/**'],
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        '@typescript-eslint/naming-convention': 'off',
        // Tests intentionally throw non-Error literals to verify defensive handling of
        // arbitrary thrown values from third-party callbacks (ssh2, dns-sd, etc.).
        'no-throw-literal': 'off'
    }
});

