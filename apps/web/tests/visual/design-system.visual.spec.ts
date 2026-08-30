import { test, expect } from '@playwright/test';

/**
 * Visual-regression baseline for the design-system catalog (issue #75).
 * Any unintended change to a primitive's rendering makes these diffs fail; a
 * deliberate change is accepted by regenerating baselines
 * (`npm run test:visual:update`).
 */
test.describe('design system — visual regression', () => {
  test('catalog — light theme', async ({ page }) => {
    await page.goto('/design-system');
    await page.waitForSelector('[data-testid="design-system"]');
    await expect(page).toHaveScreenshot('design-system-light.png', { fullPage: true });
  });

  test('catalog — dark theme', async ({ page }) => {
    await page.goto('/design-system');
    await page.waitForSelector('[data-testid="design-system"]');
    // Flip to dark via the real ThemeSwitcher (aria-label set when light).
    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
    await expect(page).toHaveScreenshot('design-system-dark.png', { fullPage: true });
  });
});
