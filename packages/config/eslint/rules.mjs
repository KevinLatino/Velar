/**
 * Rule severities and ignore globs shared across every VELAR workspace.
 *
 * These are plugin-agnostic: they only set severities for rules whose plugins
 * the consumer already registers (e.g. apps/web loads `typescript-eslint` via
 * `eslint-config-next`). apps/web spreads these next to its Next config; the
 * self-contained `eslint/base.mjs` (for non-Next packages) also applies them.
 */
export const sharedIgnores = ['**/dist/**', '**/node_modules/**', '**/.next/**'];

export const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': 'warn',
};
