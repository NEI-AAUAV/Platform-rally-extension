import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

async function mockCommonAdminApis(page: Page) {
  await page.route('**/api/rally/v1/checkpoint/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/rally/v1/team/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/rally/v1/activities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/rally/v1/events', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/rally/v1/staff/all-evaluations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluations: [] }) }),
  );
}

test.describe('Admin tab deep-linking', () => {
  test('opens directly on the checkpoints tab via ?tab=checkpoints', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=checkpoints');

    await expect(page.getByRole('heading', { name: 'Checkpoints Existentes' })).toBeVisible();
  });

  test('opens directly on the badges tab via ?tab=badges', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);
    await page.route('**/api/rally/v1/badge-definitions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await page.goto('/rally/admin?tab=badges');

    await expect(page.getByText('Catálogo de Crachás')).toBeVisible();
  });

  test('falls back to the default (dashboard) tab for an unknown ?tab= value', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=nonexistent');

    await expect(page.getByText('Estado do evento')).toBeVisible();
  });

  test('clicking a tab button updates the URL search param', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);
    await page.route('**/api/rally/v1/staff/all-evaluations', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluations: [] }) }),
    );

    await page.goto('/rally/admin');
    await page.getByRole('button', { name: 'Postos' }).click();

    await expect(page).toHaveURL(/tab=checkpoints/);
  });

  test('opens directly on the teams tab via ?tab=teams', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=teams');

    await expect(page.getByText('Equipas Existentes')).toBeVisible();
  });

  test('opens directly on the members tab via ?tab=members', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await page.goto('/rally/admin?tab=members');

    // Embedded mode suppresses the page's own header, so assert on the
    // always-visible team selector instead.
    await expect(page.getByRole('heading', { name: 'Selecionar Equipa' })).toBeVisible();
  });

  test('opens directly on the evaluation tab via ?tab=evaluation', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=evaluation');

    // Embedded mode suppresses the page's own header, so assert on the
    // always-visible "Todas as Avaliações" toggle instead.
    await expect(page.getByText('Todas as Avaliações')).toBeVisible();
  });

  test('opens directly on the settings tab via ?tab=settings', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCommonAdminApis(page);
    await page.route('**/api/rally/v1/rally/settings**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) });
    });

    await page.goto('/rally/admin?tab=settings');

    // Embedded mode suppresses the page's own header (the admin shell already
    // has one), so assert on a section nav button instead — the Save bar
    // only mounts once a change makes the form dirty, so it's not a reliable
    // "the settings tab loaded" marker.
    await expect(page.getByRole('button', { name: 'Jogo' })).toBeVisible({ timeout: 20000 });
  });

  test('non-admin visiting a deep-linked tab is redirected to the fallback path', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=scoring');

    await page.waitForURL('**/scoreboard');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
