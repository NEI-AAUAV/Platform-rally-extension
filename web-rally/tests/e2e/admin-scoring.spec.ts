import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

async function mockRules(page: Page, rules: unknown[]) {
  await page.route('**/api/rally/v1/dynamic-rules', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rules) });
    }
    return route.fallback();
  });
}

async function mockAwards(page: Page, awards: unknown[]) {
  await page.route('**/api/rally/v1/dynamic-awards', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(awards) });
    }
    return route.fallback();
  });
}

async function mockTeams(page: Page, teams: unknown[]) {
  await page.route('**/api/rally/v1/team/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teams) }),
  );
}

async function gotoScoring(page: Page) {
  await page.goto('/rally/admin?tab=scoring');
}

test.describe('Admin scoring', () => {
  test('creates a dynamic bonus rule', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockRules(page, []);
    await mockAwards(page, []);
    await mockTeams(page, []);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/dynamic-rules', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, ...(capturedBody as object) }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoScoring(page);
    await page.getByRole('button', { name: 'Nova regra' }).click();
    await page.getByPlaceholder('Nome da regra').fill('Melhor Claque');
    await page.getByPlaceholder('ex: 50').fill('50');
    await page.getByRole('button', { name: /Criar$/ }).first().click();

    await expect.poll(() => capturedBody).toMatchObject({
      name: 'Melhor Claque',
      rule_type: 'bonus',
      points: 50,
      is_active: true,
      is_automatic: false,
    });
  });

  test('lists rules with type and points', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockRules(page, [{ id: 1, name: 'Melhor Claque', rule_type: 'bonus', points: 50, description: null, is_active: true }]);
    await mockAwards(page, []);
    await mockTeams(page, []);

    await gotoScoring(page);

    await expect(page.getByText('Melhor Claque')).toBeVisible();
    await expect(page.getByText('bonus · +50 pts')).toBeVisible();
  });

  test('creates a manual penalty award with a negative point value', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockRules(page, []);
    await mockAwards(page, []);
    await mockTeams(page, [{ ...MOCK_TEAM, id: 3, name: 'Última Ronda' }]);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/dynamic-awards', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, ...(capturedBody as object) }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoScoring(page);
    await page.getByRole('button', { name: 'Novo prémio' }).click();
    await page.locator('select').filter({ hasText: 'Selecionar…' }).selectOption({ label: 'Última Ronda' });
    await page.getByPlaceholder('ex: -10 ou 50').fill('-30');
    await page.getByPlaceholder('Opcional').last().fill('Comportamento antidesportivo');
    await page.getByRole('button', { name: /Criar$/ }).last().click();

    await expect.poll(() => capturedBody).toEqual({ team_id: 3, points: -30, reason: 'Comportamento antidesportivo' });
  });

  test('deleting an award calls the delete endpoint', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockRules(page, []);
    await mockAwards(page, [{ id: 1, team_id: 3, points: 50, reason: 'Bónus', rule_id: null, is_active: true }]);
    await mockTeams(page, [{ ...MOCK_TEAM, id: 3, name: 'Última Ronda' }]);
    let deleteCalled = false;
    await page.route('**/api/rally/v1/dynamic-awards/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    page.on('dialog', (dialog) => dialog.accept());

    await gotoScoring(page);
    await page.getByText('Última Ronda', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByTitle('Revogar').click();

    await expect.poll(() => deleteCalled).toBe(true);
  });

  test('shows empty states for rules and awards', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockRules(page, []);
    await mockAwards(page, []);
    await mockTeams(page, []);

    await gotoScoring(page);

    await expect(page.getByText('Sem regras definidas.')).toBeVisible();
    await expect(page.getByText('Sem prémios ativos.')).toBeVisible();
  });
});
