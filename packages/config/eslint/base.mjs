import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { sharedIgnores, sharedRules } from './rules.mjs';

/**
 * Self-contained flat ESLint config for non-Next VELAR packages (e.g.
 * `@velar/ui` and the ui-sandbox consumer). It bundles the plugins it needs, so
 * a consumer only has to `export default from '@velar/config/eslint/base'`.
 *
 * apps/web does NOT use this (it would double-register `typescript-eslint`
 * alongside `eslint-config-next`); it composes `eslint/rules` instead.
 */
export default [
  { ignores: sharedIgnores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...sharedRules,
    },
  },
];
