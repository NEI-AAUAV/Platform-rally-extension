import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from '../mocks/data';
import type { RallySettingsResponse } from '@/client';

async function seedTeamAuth(context: BrowserContext, page: Page, teamId = 3) {
  await context.addInitScript(
    (id) => {
      localStorage.setItem('rally_team_token', 'team-jwt');
      localStorage.setItem('rally_team_data', JSON.stringify({ team_id: id, team_name: 'Os Fixes' }));
    },
    teamId,
  );
  await page.route('**/api/rally/v1/team-auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'team-jwt' }) }),
  );
  // useTeamAuth loads the team behind the session; without this the query
  // retries against the preview server and the page stays on its loading state.
  await page.route(`**/api/rally/v1/team/${teamId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_TEAM, id: teamId, name: 'Os Fixes' }),
    }),
  );
}

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }),
  );
}

async function mockShowcase(page: Page, definitions: unknown[], earned: unknown[], teamId = 3) {
  await page.route(`**/api/rally/v1/teams/${teamId}/badge-showcase`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ definitions, earned }),
    }),
  );
}

const DEFINITIONS = [
  { code: 'first-checkin', name: 'Primeiro Check-in', description: 'Fez o primeiro check-in', icon_url: null },
  { code: 'speedster', name: 'Velocista', description: 'Completou um posto rapidamente', icon_url: null },
];

test.describe('Conquistas', () => {
  test('shows badge showcase with earned and locked badges', async ({ page, context }) => {
    await mockSettings(page, { badges_enabled: true });
    await seedTeamAuth(context, page);
    await mockShowcase(page, DEFINITIONS, [
      { code: 'first-checkin', awarded_at: new Date().toISOString() },
    ]);

    await page.goto('/rally/achievements');

    await expect(page.getByText('Badges')).toBeVisible();
    await expect(page.getByText('Conquistadas')).toBeVisible();
    await expect(page.getByText('Primeiro Check-in', { exact: true })).toBeVisible();
    await expect(page.getByText('Velocista', { exact: true })).toBeVisible();
  });

  test('redirects home when badges_enabled is false', async ({ page, context }) => {
    await mockSettings(page, { badges_enabled: false });
    await seedTeamAuth(context, page);
    await mockShowcase(page, DEFINITIONS, []);

    await page.goto('/rally/achievements');

    await page.waitForURL('**/rally/');
    await expect(page).not.toHaveURL(/\/achievements/);
  });

  test('redirects to team-login when not authenticated', async ({ page }) => {
    await mockSettings(page, { badges_enabled: true });

    await page.goto('/rally/achievements');

    await page.waitForURL('**/team-login');
    await expect(page).not.toHaveURL(/\/achievements/);
  });

  test('renders nothing extra when showcase data fails to load', async ({ page, context }) => {
    await mockSettings(page, { badges_enabled: true });
    await seedTeamAuth(context, page);
    await page.route('**/api/rally/v1/teams/3/badge-showcase', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await page.goto('/rally/achievements');

    await expect(page.getByText('Badges')).toHaveCount(0);
  });

  test('renders correctly on mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page, { badges_enabled: true });
    await seedTeamAuth(context, page);
    await mockShowcase(page, DEFINITIONS, []);

    await page.goto('/rally/achievements');

    await expect(page.getByText('Badges')).toBeVisible();
  });
});
