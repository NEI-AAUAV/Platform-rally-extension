import { test, expect, type Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

test.describe('Preferences', () => {
  test('reachable while logged out and shows appearance settings', async ({ page }) => {
    await mockSettings(page);

    await page.goto('/rally/preferences');

    await expect(page.getByRole('heading', { name: 'Preferências' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Tema' })).toBeVisible();
  });

  test('switching theme updates the active radio option', async ({ page }) => {
    await mockSettings(page);

    await page.goto('/rally/preferences');

    const darkOption = page.getByRole('radio', { name: 'Escuro' });
    await darkOption.click();

    await expect(darkOption).toHaveAttribute('aria-checked', 'true');
  });

  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);

    await page.goto('/rally/preferences');

    await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
  });
});
