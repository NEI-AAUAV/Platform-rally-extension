import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
  await page.route('**/api/rally/v1/rally/settings', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, event_name: 'Rally Tascas', event_subtitle: 'Competição de Equipas', accent_color: '#008542' }),
      });
    }
    return route.fallback();
  });
}

async function gotoBranding(page: Page) {
  await page.goto('/rally/admin?tab=branding');
}

test.describe('Admin branding', () => {
  test('loads current branding fields', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoBranding(page);

    await expect(page.locator('#event_name')).toHaveValue('Rally Tascas');
    await expect(page.locator('#event_subtitle')).toHaveValue('Competição de Equipas');
  });

  test('saving branding fields echoes the full settings object with only text fields changed', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/rally/settings', (route) => {
      if (route.request().method() === 'PUT') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(capturedBody) });
      }
      return route.fallback();
    });

    await gotoBranding(page);
    await page.locator('#event_name').fill('Rally Tascas 2027');
    await page.getByRole('button', { name: 'Guardar identidade' }).click();

    await expect.poll(() => (capturedBody as { event_name?: string })?.event_name).toBe('Rally Tascas 2027');
    await expect.poll(() => (capturedBody as { max_teams?: number })?.max_teams).toBe(MOCK_RALLY_SETTINGS.max_teams);
  });

  test('uploading a banner without R2 configured shows a 503 error toast', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/rally/settings/banner', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Image upload is disabled: R2 storage is not configured.' }),
      }),
    );

    await gotoBranding(page);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from('fake') });

    await expect(page.getByText(/R2 storage is not configured/)).toBeVisible();
  });

  test('successful logo upload shows a success toast', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/rally/settings/logo', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );

    await gotoBranding(page);
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(1).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('fake') });

    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible();
  });

  test('renders correctly on mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoBranding(page);

    await expect(page.locator('#event_name')).toBeVisible();
  });
});
