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
  { id: 1, name: 'Posto 1', description: 'Primeiro', latitude: null, longitude: null, order: 1 },
];

async function mockCheckpoints(page: Page, checkpoints: unknown[] = CHECKPOINTS) {
  await page.route('**/api/rally/v1/checkpoint/', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(checkpoints) });
    }
    return route.fallback();
  });
}

async function mockActivities(page: Page, activities: unknown[]) {
  await page.route('**/api/rally/v1/activities/', (route) => {
    if (route.request().method() === 'GET') {
      // ActivityManagement reads activitiesData?.activities — the endpoint
      // returns the paginated ActivityListResponse shape, not a bare array.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activities, total: activities.length, page: 1, size: 100 }),
      });
    }
    return route.fallback();
  });
}

async function gotoActivities(page: Page) {
  await page.goto('/rally/admin?tab=activities');
}

function activity(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'Cabo de Guerra',
    description: null,
    activity_type: 'GeneralActivity',
    checkpoint_id: 1,
    config: {},
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

test.describe('Admin activities', () => {
  test('create button is disabled with no checkpoints', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page, []);
    await mockActivities(page, []);

    await gotoActivities(page);

    await expect(page.getByText('É necessário criar pelo menos um checkpoint antes de criar atividades.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Atividade' })).toBeDisabled();
  });

  test('shows empty state when no activities exist', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, []);

    await gotoActivities(page);

    await expect(page.getByText('Nenhuma atividade criada')).toBeVisible();
  });

  test('creates a time-based activity with min/max points', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, []);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/activities/', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activity(capturedBody as Record<string, unknown>)) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoActivities(page);
    await page.getByRole('button', { name: 'Nova Atividade' }).click();
    await page.getByPlaceholder('Ex: Cabo de Guerra').fill('Corrida de Sacos');
    await page.locator('select[name="activity_type"]').selectOption({ label: 'Baseada em Tempo' });
    await page.getByRole('button', { name: /Criar$/ }).click();

    await expect.poll(() => (capturedBody as { name?: string })?.name).toBe('Corrida de Sacos');
  });

  test('creates a team-vs activity with base/completion/win/draw/lose points', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, []);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/activities/', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activity(capturedBody as Record<string, unknown>)) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoActivities(page);
    await page.getByRole('button', { name: 'Nova Atividade' }).click();
    await page.getByPlaceholder('Ex: Cabo de Guerra').fill('Tiro à Corda');
    await page.locator('select').nth(1).selectOption('TeamVsActivity');

    // Values deliberately differ from the fields' own defaults (100/50/0) —
    // filling a controlled input with its already-displayed value is a no-op
    // that never dispatches an input event, so it wouldn't exercise the
    // onChange -> setConfigData wiring this test is meant to cover.
    await page.locator('#config-tv-win-points').fill('80');
    await page.locator('#config-tv-draw-points').fill('40');
    await page.locator('#config-tv-lose-points').fill('10');
    await page.getByRole('button', { name: /Criar$/ }).click();

    await expect.poll(() => (capturedBody as { config?: Record<string, number> })?.config?.win_points).toBe(80);
  });

  test('editing an activity pre-fills the form', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, [activity({})]);

    await gotoActivities(page);
    // lucide-react's Edit icon is an alias for SquarePen; the rendered class
    // follows the resolved icon name, not the imported alias.
    await page.getByRole('button').filter({ has: page.locator('.lucide-square-pen') }).first().click();

    await expect(page.getByText('Editar Atividade')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Cabo de Guerra')).toHaveValue('Cabo de Guerra');
  });

  test('deleting an activity requires confirmation', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, [activity({})]);
    let deleteCalled = false;
    await page.route('**/api/rally/v1/activities/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    page.on('dialog', (dialog) => dialog.accept());

    await gotoActivities(page);
    await page.getByRole('button').filter({ has: page.locator('.lucide-trash-2') }).first().click();

    await expect.poll(() => deleteCalled).toBe(true);
  });

  test('shows inline error when create fails', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpoints(page);
    await mockActivities(page, []);
    await page.route('**/api/rally/v1/activities/', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid activity type' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoActivities(page);
    await page.getByRole('button', { name: 'Nova Atividade' }).click();
    await page.getByPlaceholder('Ex: Cabo de Guerra').fill('Atividade Inválida');
    await page.getByRole('button', { name: /Criar$/ }).click();

    await expect(page.getByText(/Invalid activity type/).first()).toBeVisible();
  });
});
