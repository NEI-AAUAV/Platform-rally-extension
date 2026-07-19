import { test, expect, type Page } from '@playwright/test';
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

  test('non-admin visiting a deep-linked tab is redirected to the fallback path', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockCommonAdminApis(page);

    await page.goto('/rally/admin?tab=scoring');

    await page.waitForURL('**/scoreboard');
  });
});
