import { defineConfig, devices } from '@playwright/test';

/**
 * Visual-regression gate for the design system (issue #75).
 *
 * Screenshots the /design-system catalog and diffs against committed baselines
 * under `tests/visual/__screenshots__`. This is intentionally NOT part of
 * `npm run test` (which stays browser-free): run `npm run test:visual`, and
 * update baselines deliberately with `npm run test:visual:update`.
 *
 * Baselines are environment-sensitive (font rendering differs per OS); the CI
 * that owns the baseline should regenerate them with the update script. See
 * docs/FRONTEND_GUIDE.md.
 */
const PORT = 3100;

export default defineConfig({
  testDir: './tests/visual',
  snapshotDir: './tests/visual/__screenshots__',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'placeholder-anon-key',
    },
  },
});
