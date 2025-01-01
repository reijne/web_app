import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

import noDirectSessionStorage from './eslint-rules/no-direct-sessionstorage.mjs';

export default [
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module',
                ecmaVersion: 'latest',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'custom-rules': {
                rules: {
                    'no-direct-sessionstorage': noDirectSessionStorage,
                },
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            curly: ['error', 'all'], // Enforce braces for all control flow statements
            'no-alert': 'error',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@/no-console': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/strict-boolean-expressions': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'error',
            'custom-rules/no-direct-sessionstorage': 'warn',
        },
    },
];
