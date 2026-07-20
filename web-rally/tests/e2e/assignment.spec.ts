import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS, STAFF_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

const CHECKPOINTS = [
  { id: 1, name: 'Posto 1', description: null, latitude: null, longitude: null, order: 1 },
  { id: 2, name: 'Posto 2', description: null, latitude: null, longitude: null, order: 2 },
];

async function mockCheckpoints(page: Page) {
  await page.route('**/api/rally/v1/checkpoint/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKPOINTS) }),
  );
}

async function mockAssignments(page: Page, assignments: unknown[]) {
  await page.route('**/api/rally/v1/user/staff-assignments', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }),
  );
}

const ASSIGNMENTS = [
  { id: 1, user_id: 10, user_name: 'Rui', user_email: 'rui@ua.pt', checkpoint_id: null, checkpoint_name: null },
  { id: 2, user_id: 11, user_name: 'Sofia', user_email: 'sofia@ua.pt', checkpoint_id: 2, checkpoint_name: 'Posto 2' },
];

test.describe('Staff assignment', () => {
  test('admin sees staff list with checkpoint assignments', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockAssignments(page, ASSIGNMENTS);

    await page.goto('/rally/assignment');

    await expect(page.getByText('Rui', { exact: true })).toBeVisible();
    await expect(page.getByText('Sofia', { exact: true })).toBeVisible();
    await expect(page.getByText('Checkpoint: Posto 2')).toBeVisible();
    await expect(page.getByText('Checkpoint: Não atribuído')).toBeVisible();
  });

  test('reassigning a staff member to a checkpoint calls the update endpoint', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockAssignments(page, ASSIGNMENTS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/user/10/checkpoint-assignment', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ASSIGNMENTS[0], checkpoint_id: 1, checkpoint_name: 'Posto 1' }),
      });
    });

    await page.goto('/rally/assignment');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Posto 1' }).click();

    await expect.poll(() => capturedBody).toEqual({ checkpoint_id: 1 });
  });

  test('removing an assignment sends checkpoint_id null', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockAssignments(page, ASSIGNMENTS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/user/11/checkpoint-assignment', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ASSIGNMENTS[1], checkpoint_id: null, checkpoint_name: null }),
      });
    });

    await page.goto('/rally/assignment');
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Remover atribuição' }).click();

    await expect.poll(() => capturedBody).toEqual({ checkpoint_id: null });
  });

  test('staff without a checkpoint assignment sees an unauthorized redirect', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, STAFF_GROUPS);
    await mockCheckpoints(page);

    await page.goto('/rally/assignment');

    await page.waitForURL('**/scoreboard');
    await expect(page).not.toHaveURL(/\/assignment/);
  });

  test('shows empty state when there are no assignments', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockAssignments(page, []);

    await page.goto('/rally/assignment');

    await expect(page.getByText('Nenhuma atribuição de staff encontrada.')).toBeVisible();
  });

  test('shows error state when assignments fail to load', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await page.route('**/api/rally/v1/user/staff-assignments', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await page.goto('/rally/assignment');

    await expect(page.getByText('Erro ao carregar atribuições')).toBeVisible();
  });
});
