import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockPublicSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

function adminSettings(overrides: Record<string, unknown> = {}) {
  return {
    ...MOCK_RALLY_SETTINGS,
    participant_view_enabled: false,
    show_route_mode: 'focused',
    allow_photo_as_team_photo: false,
    guide_mode_enabled: false,
    guide_mode_active: false,
    badges_enabled: true,
    home_layout: [],
    ticker_items: [],
    ...overrides,
  };
}

async function mockAdminSettings(page: Page, settings = adminSettings()) {
  await page.route('**/api/rally/v1/rally/settings', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) });
    }
    return route.fallback();
  });
}

async function gotoSettingsInEditMode(page: Page) {
  await page.goto('/rally/settings');
  await page.getByRole('button', { name: 'Editar Configurações' }).click();
}

async function captureSave(page: Page): Promise<() => unknown> {
  let capturedBody: unknown;
  await page.route('**/api/rally/v1/rally/settings', (route) => {
    if (route.request().method() === 'PUT') {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(capturedBody) });
    }
    return route.fallback();
  });
  return () => capturedBody;
}

test.describe('Settings toggle matrix', () => {
  test('toggling show_live_leaderboard off and saving sends false', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_live_leaderboard: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#show_live_leaderboard)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { show_live_leaderboard?: boolean })?.show_live_leaderboard).toBe(false);
  });

  test('toggling show_team_details off and saving sends false', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_team_details: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#show_team_details)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { show_team_details?: boolean })?.show_team_details).toBe(false);
  });

  test('toggling show_checkpoint_map off and saving sends false', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_checkpoint_map: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#show_checkpoint_map)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { show_checkpoint_map?: boolean })?.show_checkpoint_map).toBe(false);
  });

  test('enabling participant_view_enabled and saving sends true', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ participant_view_enabled: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#participant_view_enabled)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { participant_view_enabled?: boolean })?.participant_view_enabled).toBe(true);
  });

  test('changing show_route_mode to "complete" saves the new value', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_route_mode: 'focused' }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('#show_route_mode').click();
    await page.getByRole('option', { name: 'Trajeto completo' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { show_route_mode?: string })?.show_route_mode).toBe('complete');
  });

  test('changing show_score_mode to "competitive" saves the new value', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_score_mode: 'hidden' }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('#show_score_mode').click();
    await page.getByRole('option', { name: 'Classificação completa' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { show_score_mode?: string })?.show_score_mode).toBe('competitive');
  });

  test('enabling public_access_enabled and saving sends true', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ public_access_enabled: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#public_access_enabled)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { public_access_enabled?: boolean })?.public_access_enabled).toBe(true);
  });

  test('toggling guide_mode_enabled and guide_mode_active independently', async ({
    page,
    context,
  }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ guide_mode_enabled: false, guide_mode_active: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#guide_mode_enabled)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { guide_mode_enabled?: boolean })?.guide_mode_enabled).toBe(true);
    await expect.poll(() => (getBody() as { guide_mode_active?: boolean })?.guide_mode_active).toBe(false);
  });

  test('disabling badges_enabled and saving sends false', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ badges_enabled: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#badges_enabled)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { badges_enabled?: boolean })?.badges_enabled).toBe(false);
  });

  test('toggling allow_photo_as_team_photo and saving sends true', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ allow_photo_as_team_photo: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#allow_photo_as_team_photo)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => (getBody() as { allow_photo_as_team_photo?: boolean })?.allow_photo_as_team_photo).toBe(true);
  });

  test('canceling edit mode discards unsaved toggle changes', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_live_leaderboard: true }));

    await gotoSettingsInEditMode(page);
    await page.locator('label:has(#show_live_leaderboard)').click();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('button', { name: 'Editar Configurações' })).toBeVisible();
  });

  test('save error shows a toast and keeps edit mode open', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page);
    await page.route('**/api/rally/v1/rally/settings', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) });
      }
      return route.fallback();
    });

    await gotoSettingsInEditMode(page);
    await page.getByRole('button', { name: 'Guardar' }).click();

    // getErrorMessage prefers the API's error.body.detail over the fallback
    // string, so the toast shows the server's message, not the generic one.
    await expect(page.getByText('Server error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
  });
});
