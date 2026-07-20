import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS, STAFF_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

const TEAMS = [
  { id: 1, name: 'Os Fintas', total: 100, classification: 1, versus_group_id: null, num_members: 2, times: [], last_checkpoint_time: null, last_checkpoint_score: null, last_checkpoint_number: null, last_checkpoint_name: null, current_checkpoint_number: 1 },
];

const MEMBERS = [
  { id: 1, name: 'João', email: 'joao@ua.pt', is_captain: true },
  { id: 2, name: 'Inês', email: null, is_captain: false },
];

async function mockTeams(page: Page) {
  await page.route('**/api/rally/v1/team/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/members') || url.includes('/members?')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MEMBERS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEAMS) });
  });
}

async function selectTeam(page: Page, name = 'Os Fintas') {
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

test.describe('Team members (admin)', () => {
  test('admin can view team selector, member list and add-member form', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page);

    await page.goto('/rally/team-members');
    await expect(page.getByText('Gestão de membros')).toBeVisible();
    await selectTeam(page);

    await expect(page.getByText('João')).toBeVisible();
    await expect(page.getByText('Inês')).toBeVisible();
    await expect(page.getByLabel('Nome', { exact: false })).toBeVisible();
  });

  test('adding a 6th member to a team at max_members_per_team is rejected', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page);
    await page.route('**/api/rally/v1/team/1/members', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Team has reached the maximum number of members' }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MEMBERS) });
    });

    await page.goto('/rally/team-members');
    await selectTeam(page);
    await page.getByLabel('Nome', { exact: false }).fill('Sexto Membro');
    await page.getByRole('button', { name: /Adicionar/ }).click();

    await expect(page.getByText('Team has reached the maximum number of members', { exact: true }).first()).toBeVisible();
  });

  test('staff sees read-only roster, not the add-member form', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, STAFF_GROUPS);
    await mockTeams(page);
    await page.route('**/api/rally/v1/team/1**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          name: 'Os Fintas',
          total: 0,
          times: [],
          members: MEMBERS,
          num_members: 2,
          classification: 1,
          question_scores: [],
          time_scores: [],
          pukes: [],
          skips: [],
          score_per_checkpoint: [],
        }),
      }),
    );

    await page.goto('/rally/team-members');
    await expect(page.getByText('Consultar equipas')).toBeVisible();
    await selectTeam(page);

    await expect(page.getByLabel('Nome', { exact: false })).toHaveCount(0);
  });

  test('non-admin non-staff user is redirected to scoreboard', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockTeams(page);

    await page.goto('/rally/team-members');

    await page.waitForURL('**/scoreboard');
  });

  test('shows empty state when no teams exist', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await page.goto('/rally/team-members');

    await expect(
      page.getByText('Não existem equipas criadas ainda. Para gerir membros das equipas, primeiro precisa de criar equipas.'),
    ).toBeVisible();
  });

  test('shows error banner when teams fail to load', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await page.goto('/rally/team-members');

    await expect(page.getByText('Erro ao carregar equipas:')).toBeVisible();
  });
});
