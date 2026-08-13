import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

const CHECKPOINTS = [
  { id: 3, name: 'Posto 3', description: null, latitude: null, longitude: null, order: 3 },
];

async function mockCheckpoints(page: Page) {
  await page.route('**/api/rally/v1/checkpoint/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKPOINTS) }),
  );
}

async function mockGuideAssignments(page: Page, assignments: unknown[]) {
  await page.route('**/api/rally/v1/user/guide-assignments', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }),
  );
}

const ASSIGNMENTS = [
  { id: 1, user_id: 20, user_name: 'Beatriz', user_email: 'beatriz@ua.pt', checkpoint_id: null, checkpoint_name: null },
];

test.describe('Guide assignment', () => {
  test('admin assigns a guide to a checkpoint', async ({ page, context }, testInfo) => {
    // Interaction test (combobox click precision), not visual — mobile's
    // narrower viewport packs unrelated text into the combobox's hit area,
    // no extra signal over the desktop run.
    test.skip(testInfo.project.name === 'mobile', 'Desktop-only: not a visual/layout test');
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockGuideAssignments(page, ASSIGNMENTS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/user/20/guide-checkpoint-assignment', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ASSIGNMENTS[0], checkpoint_id: 3, checkpoint_name: 'Posto 3' }),
      });
    });

    await page.goto('/rally/guide-assignment');
    await expect(page.getByText('Beatriz', { exact: true })).toBeVisible();

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Posto 3' }).click();

    await expect.poll(() => capturedBody).toEqual({ checkpoint_id: 3 });
  });

  test('shows empty state when there are no guide assignments', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockGuideAssignments(page, []);

    await page.goto('/rally/guide-assignment');

    await expect(page.getByText('Nenhuma atribuição de guia encontrada.')).toBeVisible();
  });
});
