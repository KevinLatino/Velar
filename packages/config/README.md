# @velar/config

Shared ESLint and TypeScript configuration for the VELAR monorepo, so every
consumer (`apps/web`, `packages/ui`, the `ui-sandbox` example, …) gets the same
rules instead of duplicating them.

## TypeScript

- `@velar/config/tsconfig/base.json` — base compiler options (strict, ESM,
  `bundler` resolution, `react-jsx`).
- `@velar/config/tsconfig/react-library.json` — extends base and turns on
  `declaration` for buildable React packages.

```jsonc
// packages/ui/tsconfig.json
{
  "extends": "@velar/config/tsconfig/react-library.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

## ESLint (flat config, ESLint 9)

- `@velar/config/eslint/base` — self-contained flat config for **non-Next**
  packages (bundles `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`).

  ```js
  // packages/ui/eslint.config.mjs
  import base from '@velar/config/eslint/base';
  export default [...base, { ignores: ['dist/**'] }];
  ```

- `@velar/config/eslint/rules` — plugin-agnostic `sharedRules` + `sharedIgnores`
  for **apps/web**, which already loads `typescript-eslint` through
  `eslint-config-next` and would otherwise double-register the plugin.

  ```js
  // apps/web/eslint.config.mjs
  import { sharedRules, sharedIgnores } from '@velar/config/eslint/rules';
  export default [ ...next, { ignores: sharedIgnores }, { rules: sharedRules } ];
  ```

This package ships config source only — it has no build step.
