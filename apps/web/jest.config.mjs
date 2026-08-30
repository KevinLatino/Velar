/**
 * Two projects:
 *  - `unit`  : node-env logic specs (`*.spec.ts`) — the existing suite.
 *  - `a11y`  : jsdom-env accessibility checks (`*.a11y.test.tsx`) that render the
 *              design-system primitives and run axe-core (issue #75).
 *
 * @type {import('jest').Config}
 */
const ignore = ['/node_modules/', '/.next/', '/dist/', '/tests/visual/'];

export default {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.spec.ts'],
      testPathIgnorePatterns: ignore,
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
    },
    {
      displayName: 'a11y',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/**/*.a11y.test.tsx'],
      testPathIgnorePatterns: ignore,
      // Also transform .js so the ESM build of @velar/ui (resolved via its
      // workspace symlink to packages/ui/dist) is compiled to CJS for jest.
      transform: { '^.+\\.[jt]sx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
      transformIgnorePatterns: ['/node_modules/(?!(lucide-react)/)'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.a11y.ts'],
    },
  ],
};
