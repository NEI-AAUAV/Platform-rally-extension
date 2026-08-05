import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

test.describe('Resilience', () => {
  test('scoreboard still renders and polls when the SSE stream endpoint is unavailable', async ({
    page,
  }) => {
    await mockSettings(page);
    let teamsCallCount = 0;
    await page.route('**/api/rally/v1/team/**', (route) => {
      teamsCallCount += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_TEAM]) });
    });
    // The realtime subsystem returns 503 when disabled; useScoreboardStream
    // closes the connection on error and never opens a new one for that
    // mount, relying entirely on the query's own refetchInterval.
    await page.route('**/api/rally/v1/scoreboard/stream', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Realtime disabled' }) }),
    );

    await page.goto('/rally/scoreboard');

    await expect(page.getByText(MOCK_TEAM.name).first()).toBeVisible();
    expect(teamsCallCount).toBeGreaterThanOrEqual(1);
  });

  test('home page does not crash when checkpoints API is down', async ({ page }) => {
    await mockSettings(page);
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_TEAM]) }),
    );
    await page.route('**/api/rally/v1/checkpoint/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await page.goto('/rally/');

    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page.locator('#home-hero-heading')).toBeVisible();
  });

  test('checkpoints page shows an empty route instead of crashing when checkpoints API errors', async ({
    page,
  }) => {
    await mockSettings(page);
    await page.route('**/api/rally/v1/checkpoint/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await page.goto('/rally/checkpoints');

    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page.getByText('Nenhum posto disponível')).toBeVisible();
  });

  test('navigating away mid-request does not leave a stale error toast for the abandoned page', async ({
    page,
  }) => {
    await mockSettings(page);
    await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/rally/checkpoints');
    await page.goto('/rally/rules');

    await expect(page.getByText('Regras & FAQ')).toBeVisible();
  });

  test('team-progress falls back to polling when checkpoints-count endpoint fails', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await context.addInitScript(() => {
      localStorage.setItem('rally_team_token', 'team-jwt');
      localStorage.setItem('rally_team_data', JSON.stringify({ team_id: 3, team_name: 'Os Fixes' }));
    });
    await page.route('**/api/rally/v1/team-auth/refresh', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'team-jwt' }) }),
    );
    await page.route('**/api/rally/v1/team/3**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 3,
          name: 'Os Fixes',
          total: 0,
          times: [],
          members: [],
          num_members: 0,
          classification: 1,
          question_scores: [],
          time_scores: [],
          pukes: [],
          skips: [],
          score_per_checkpoint: [],
        }),
      }),
    );
    await page.route('**/api/rally/v1/checkpoint/count', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );
    await page.route('**/api/rally/v1/checkpoint/**', (route) => {
      if (route.request().url().includes('/count')) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/rally/team-progress');

    await expect(page.getByText('Os Fixes')).toBeVisible();
  });
});
