import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockPublicRoutes(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
}

test.describe('Team login', () => {
  test('valid access code logs the team in and redirects to progress', async ({
    page,
  }) => {
    await mockPublicRoutes(page);
    await page.route('**/api/rally/v1/team-auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'team-jwt',
          team_id: 3,
          team_name: 'Os Fixes',
        }),
      }),
    );
    // Team progress data fetched after redirect.
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

    await page.goto('/rally/team-login');

    await page.getByPlaceholder('XXXX-XXXX').fill('ABCD-1234');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await page.waitForURL('**/team-progress');
    // Session persisted for subsequent visits.
    const stored = await page.evaluate(() => localStorage.getItem('rally_team_token'));
    expect(stored).toBe('team-jwt');
  });

  test('invalid access code shows an error and stays on the page', async ({
    page,
  }) => {
    await mockPublicRoutes(page);
    await page.route('**/api/rally/v1/team-auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid access code' }),
      }),
    );

    await page.goto('/rally/team-login');

    await page.getByPlaceholder('XXXX-XXXX').fill('WRNG-0000');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('Invalid access code').first()).toBeVisible();
    expect(page.url()).toContain('/team-login');
  });

  test('rate-limited login surfaces the 429 message', async ({ page }) => {
    await mockPublicRoutes(page);
    await page.route('**/api/rally/v1/team-auth/login', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Too many requests, try again later' }),
      }),
    );

    await page.goto('/rally/team-login');

    await page.getByPlaceholder('XXXX-XXXX').fill('ABCD-1234');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(
      page.getByText('Too many requests, try again later').first(),
    ).toBeVisible();
  });
});
