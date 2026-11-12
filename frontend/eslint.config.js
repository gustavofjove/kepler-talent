const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');
const i18next = require('eslint-plugin-i18next');

// Components that still hardcode their copy (KTL-12). Entries may only be REMOVED:
// when a change touches one of these files' copy, move it to src/assets/i18n/es.json,
// render it with t(), and delete the path here. Never add a file to silence the rule.
const LEGACY_HARDCODED_COPY = [];

module.exports = [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.vite/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Escalated from the plugin default: a useMemo with an incomplete
      // dependency list yields a stale view with no runtime error, which is the
      // main correctness risk when porting Angular's tick-based getters.
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // User-facing JSX text goes through t(). Attribute copy (placeholder, aria-label) is
    // not caught by jsx-text-only; the AGENTS.md rule and review cover it.
    files: ['src/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
  ...(LEGACY_HARDCODED_COPY.length
    ? [{ files: LEGACY_HARDCODED_COPY, rules: { 'i18next/no-literal-string': 'off' } }]
    : []),
  {
    files: ['*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['public/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
