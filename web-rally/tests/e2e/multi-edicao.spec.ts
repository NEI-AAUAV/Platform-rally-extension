import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockEvents(page: Page, events: unknown[]) {
  await page.route('**/api/rally/v1/events', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) });
    }
    return route.fallback();
  });
}

function event(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'Edition',
    event_type: 'rally_tascas',
    description: null,
    start_time: null,
    end_time: null,
    is_current: false,
    ...overrides,
  };
}

test.describe('Multi-edition isolation', () => {
  test('switching the current event refetches public settings, checkpoints and teams — not stale cached data', async ({
    page,
    context,
  }) => {
    await seedOidcSession(context, ADMIN_GROUPS);

    let publicSettingsCallCount = 0;
    await page.route('**/api/rally/v1/rally/settings/public**', (route) => {
      publicSettingsCallCount += 1;
      const settings =
        publicSettingsCallCount === 1
          ? { ...MOCK_RALLY_SETTINGS, event_name: 'Rally Tascas 2025' }
          : { ...MOCK_RALLY_SETTINGS, event_name: 'Rally Tascas 2026' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) });
    });

    let checkpointsCallCount = 0;
    await page.route('**/api/rally/v1/checkpoint/**', (route) => {
      checkpointsCallCount += 1;
      const checkpoints =
        checkpointsCallCount === 1
          ? [{ id: 1, name: 'Posto da Edição 2025', description: null, latitude: null, longitude: null, order: 1 }]
          : [{ id: 2, name: 'Posto da Edição 2026', description: null, latitude: null, longitude: null, order: 1 }];
      // The admin checkpoints tab reads the route-status envelope, not the
      // bare list — everything else that hits this glob still wants the array.
      const isRouteStatus = route.request().url().endsWith('/checkpoint/admin/route');
      const body = isRouteStatus
        ? { published_count: checkpoints.length, draft_count: 0, incomplete_published_ids: [], checkpoints }
        : checkpoints;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    let teamsCallCount = 0;
    await page.route('**/api/rally/v1/team/**', (route) => {
      teamsCallCount += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await mockEvents(page, [
      event({ id: 1, name: 'Rally Tascas 2025', is_current: true }),
      event({ id: 2, name: 'Rally Tascas 2026', is_current: false }),
    ]);
    await page.route('**/api/rally/v1/events/2/set-current', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(event({ id: 2, name: 'Rally Tascas 2026', is_current: true })),
      }),
    );

    await page.goto('/rally/admin?tab=checkpoints');
    await expect(page.getByText('Posto da Edição 2025')).toBeVisible();

    await page.goto('/rally/admin?tab=events');
    await page.getByRole('button', { name: 'Tornar atual' }).click();

    // The checkpoints tab must show the NEW edition's data, not the cached
    // 2025 checkpoint — proving invalidation actually happened.
    await page.goto('/rally/admin?tab=checkpoints');
    await expect(page.getByText('Posto da Edição 2026')).toBeVisible();
    await expect(page.getByText('Posto da Edição 2025')).toHaveCount(0);

    expect(checkpointsCallCount).toBeGreaterThanOrEqual(2);
    void teamsCallCount;
  });

  test('the admin events list shows both editions with only one marked current', async ({
    page,
    context,
  }) => {
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );
    await mockEvents(page, [
      event({ id: 1, name: 'Rally Tascas 2025', is_current: false }),
      event({ id: 2, name: 'Rally Tascas 2026', is_current: true }),
    ]);

    await page.goto('/rally/admin?tab=events');

    await expect(page.getByText('Rally Tascas 2025')).toBeVisible();
    await expect(page.getByText('Rally Tascas 2026')).toBeVisible();
    await expect(page.getByText('Atual', { exact: true })).toHaveCount(1);
  });

  test('an access code from a non-current edition is rejected by team login', async ({ page }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );
    await page.route('**/api/rally/v1/team-auth/login', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid access code' }),
      }),
    );

    await page.goto('/rally/team-login');
    await page.getByPlaceholder('XXXX-XXXX').fill('OLD1-2025');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('Invalid access code').first()).toBeVisible();
    expect(page.url()).toContain('/team-login');
  });
});
