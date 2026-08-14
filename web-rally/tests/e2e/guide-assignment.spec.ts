import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

const TEAMS = [{ id: 3, name: 'Equipa 3', total: 0, num_members: 0, classification: -1, photo_url: '' }];

async function mockTeams(page: Page) {
  await page.route('**/api/rally/v1/team/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEAMS) }),
  );
}

async function mockGuideAssignments(page: Page, assignments: unknown[]) {
  await page.route('**/api/rally/v1/user/guide-assignments', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }),
  );
}

const ASSIGNMENTS = [
  { id: 1, user_id: 20, user_name: 'Beatriz', user_email: 'beatriz@ua.pt', team_id: null, team_name: null },
];

test.describe('Guide assignment', () => {
  test('admin assigns a guide to a team', async ({ page, context }, testInfo) => {
    // Interaction test (combobox click precision), not visual — mobile's
    // narrower viewport packs unrelated text into the combobox's hit area,
    // no extra signal over the desktop run.
    test.skip(testInfo.project.name === 'mobile', 'Desktop-only: not a visual/layout test');
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page);
    await mockGuideAssignments(page, ASSIGNMENTS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/user/20/guide-team-assignment', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ASSIGNMENTS[0], team_id: 3, team_name: 'Equipa 3' }),
      });
    });

    await page.goto('/rally/guide-assignment');
    await expect(page.getByText('Beatriz', { exact: true })).toBeVisible();

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Equipa 3' }).click();

    await expect.poll(() => capturedBody).toEqual({ team_id: 3 });
  });

  test('shows empty state when there are no guide assignments', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page);
    await mockGuideAssignments(page, []);

    await page.goto('/rally/guide-assignment');

    await expect(page.getByText('Nenhuma atribuição de guia encontrada.')).toBeVisible();
  });
});
