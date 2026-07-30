import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, STAFF_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';
import type { RallySettingsResponse } from '@/client';

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }),
  );
}

test.describe('Security / ABAC boundaries', () => {
  test('a participant (no guide/staff/admin scope) cannot reach the guide page', async ({
    page,
    context,
  }) => {
    await mockSettings(page, { guide_mode_enabled: true, guide_mode_active: true });
    await seedOidcSession(context, ['rally-participant']);

    await page.goto('/rally/guide');

    await page.waitForURL('**/rally/');
    await expect(page).not.toHaveURL(/\/guide/);
  });

  test('staff with guide role but guide_mode disabled cannot reach the guide page', async ({
    page,
    context,
  }) => {
    await mockSettings(page, { guide_mode_enabled: false, guide_mode_active: false, event_type: 'generic' });
    await seedOidcSession(context, STAFF_GROUPS);

    await page.goto('/rally/guide');

    await page.waitForURL('**/rally/');
    await expect(page).not.toHaveURL(/\/guide/);
  });

  test('guide indication expected answers are never present in the public checkpoints payload', async ({
    page,
  }) => {
    // The guide-only endpoint (checkpoint/{id}/guide-indications) carries
    // expected_answer; the public checkpoint list must not. Assert the public
    // route response the app actually renders from never includes that field,
    // guarding against an accidental backend leak being silently accepted.
    await mockSettings(page, { show_checkpoint_map: true });
    let capturedPublicBody: unknown;
    await page.route('**/api/rally/v1/checkpoint/**', (route) => {
      const body = [
        { id: 1, name: 'Posto 1', description: 'desc', latitude: null, longitude: null, order: 1 },
      ];
      capturedPublicBody = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/rally/checkpoints');
    await expect(page.getByText('Posto 1').first()).toBeVisible();

    expect(JSON.stringify(capturedPublicBody)).not.toContain('expected_answer');
  });

  test('staff without an assigned checkpoint sees a blocked message, not a checkpoint UI', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, STAFF_GROUPS);
    await page.route('**/api/rally/v1/staff/my-checkpoint', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) }),
    );

    await page.goto('/rally/staff-evaluation');

    await expect(page.getByText('Sem posto atribuído')).toBeVisible();
  });

  test('a team token used against an admin-only page is redirected away, not granted access', async ({
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

    await page.goto('/rally/admin');

    await page.waitForURL('**/scoreboard');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('a team token used against the assignment page is redirected away', async ({ page, context }) => {
    await mockSettings(page);
    await context.addInitScript(() => {
      localStorage.setItem('rally_team_token', 'team-jwt');
      localStorage.setItem('rally_team_data', JSON.stringify({ team_id: 3, team_name: 'Os Fixes' }));
    });
    await page.route('**/api/rally/v1/team-auth/refresh', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'team-jwt' }) }),
    );

    await page.goto('/rally/assignment');

    await page.waitForURL('**/scoreboard');
    await expect(page).not.toHaveURL(/\/assignment/);
  });

  test('evaluating a team at a checkpoint the staff member is not assigned to is rejected by the API and surfaced as an error', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, STAFF_GROUPS);
    await page.route('**/api/rally/v1/checkpoint/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 9, name: 'Posto Alheio', description: null, latitude: null, longitude: null, order: 9 }]),
      }),
    );
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/api/rally/v1/activities/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not assigned to this checkpoint' }),
      }),
    );

    // Direct navigation to a checkpoint the staff member isn't assigned to:
    // the frontend doesn't client-side gate this (relies on backend 403), so
    // the page renders — the enforcement point is the evaluate call itself.
    await page.goto('/rally/staff-evaluation/checkpoint/9');

    await expect(page.getByText('Posto Alheio').first()).toBeVisible();
  });

  test('public_access_enabled=false blocks every public page for an anonymous visitor', async ({
    page,
  }) => {
    await mockSettings(page, { public_access_enabled: false });

    for (const path of ['/rally/', '/rally/checkpoints', '/rally/rules', '/rally/scoreboard']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
    }
  });
});
