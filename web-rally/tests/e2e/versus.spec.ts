import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from '../mocks/data';
import type { RallySettingsResponse } from '@/client';

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }),
  );
}

function team(overrides: Record<string, unknown>) {
  return { ...MOCK_TEAM, ...overrides };
}

async function mockTeams(page: Page, teams: unknown[]) {
  await page.route('**/api/rally/v1/team/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teams) }),
  );
}

async function mockGroups(page: Page, groups: unknown[]) {
  await page.route('**/api/rally/v1/versus/groups', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups }) }),
  );
}

test.describe('Versus', () => {
  test('shows disabled alert when enable_versus is false', async ({ page, context }) => {
    await mockSettings(page, { enable_versus: false });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, []);
    await mockGroups(page, []);

    await page.goto('/rally/versus');

    await expect(page.getByText(/modo versus/i)).toBeVisible();
  });

  test('creates a versus pair between two unpaired teams', async ({ page, context }) => {
    await mockSettings(page, { enable_versus: true });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [
      team({ id: 1, name: 'Os Fintas', versus_group_id: null }),
      team({ id: 2, name: 'Engenhocas', versus_group_id: null }),
    ]);
    await mockGroups(page, []);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/versus/pair', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ group_id: 5, team_a_id: 1, team_b_id: 2 }),
      });
    });

    await page.goto('/rally/versus');
    await page.locator('#team-a-select').click();
    await page.getByRole('option', { name: /Os Fintas/ }).click();
    await page.locator('#team-b-select').click();
    await page.getByRole('option', { name: /Engenhocas/ }).click();
    await page.getByRole('button', { name: /Criar Par/i }).click();

    await expect.poll(() => capturedBody).toEqual({ team_a_id: 1, team_b_id: 2 });
  });

  test('team already in a versus group is excluded from the pairing dropdowns', async ({
    page,
    context,
  }) => {
    await mockSettings(page, { enable_versus: true });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [
      team({ id: 1, name: 'Os Fintas', versus_group_id: 9 }),
      team({ id: 2, name: 'Engenhocas', versus_group_id: null }),
      team({ id: 3, name: 'Última Ronda', versus_group_id: null }),
    ]);
    await mockGroups(page, []);

    await page.goto('/rally/versus');
    await page.locator('#team-a-select').click();

    await expect(page.getByRole('option', { name: /Os Fintas/ })).toHaveCount(0);
    await expect(page.getByRole('option', { name: /Engenhocas/ })).toBeVisible();
  });

  test('shows empty state when no versus groups exist', async ({ page, context }) => {
    await mockSettings(page, { enable_versus: true });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, []);
    await mockGroups(page, []);

    await page.goto('/rally/versus');

    await expect(page.getByText('Pares Versus Ativos')).toBeVisible();
  });

  test('lists an active versus pair with its two teams', async ({ page, context }) => {
    await mockSettings(page, { enable_versus: true });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [
      team({ id: 1, name: 'Os Fintas', versus_group_id: 5 }),
      team({ id: 2, name: 'Engenhocas', versus_group_id: 5 }),
    ]);
    await mockGroups(page, [{ group_id: 5, team_a_id: 1, team_b_id: 2 }]);

    await page.goto('/rally/versus');

    await expect(page.getByText('Os Fintas')).toBeVisible();
    await expect(page.getByText('Engenhocas')).toBeVisible();
  });
});
