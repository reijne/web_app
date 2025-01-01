import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import babelPreset from 'babel-preset-react-app/prod.js';

import noDirectSessionStorage from './eslint-rules/no-direct-sessionstorage.mjs';
import reactConfig from './eslint-rules/react-index.js';

export default [
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module',
                ecmaVersion: 'latest',
                requireConfigFile: false,
                babelOptions: {
                    presets: [babelPreset],
                },
            },
        },
        plugins: {
            ...reactConfig.plugins,
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
        overrides: reactConfig.overrides,
        rules: {
            ...reactConfig.rules,
            curly: ['error', 'all'], // Enforce braces for all control flow statements
            'no-alert': 'error',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/strict-boolean-expressions': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'error',
            'custom-rules/no-direct-sessionstorage': 'warn',
            'react/jsx-uses-vars': 'warn',
            'react/jsx-uses-react': 'warn',
        },
    },
];
