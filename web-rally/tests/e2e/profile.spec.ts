import { test, expect, type Page } from '@playwright/test';
import { seedOidcSession } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

async function mockProfile(page: Page, body: unknown, status = 200) {
  await page.route('**/api/rally/v1/profile/me', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

const NO_TEAM_PROFILE = {
  name: 'Tomás Silva',
  email: 'tomas@ua.pt',
  scopes: ['rally-participant'],
  current_team_id: null,
  participations: [],
};

test.describe('Profile', () => {
  test('shows login prompt when unauthenticated', async ({ page }) => {
    await mockSettings(page);

    await page.goto('/rally/profile');

    await expect(page.getByText('Inicia sessão')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login NEI' })).toBeVisible();
  });

  test('shows identity and empty participation history for authenticated user with no team', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);

    await page.goto('/rally/profile');

    await expect(page.getByText('Tomás Silva')).toBeVisible();
    await expect(
      page.getByText('Ainda não há participações registadas. Junta-te a uma equipa para começar.'),
    ).toBeVisible();
  });

  test('shows JoinTeamCard when profile has no current team', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);

    await page.goto('/rally/profile');

    await expect(page.getByLabel('Código da equipa')).toBeVisible();
  });

  test('hides JoinTeamCard when profile already has a team', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, { ...NO_TEAM_PROFILE, current_team_id: 7 });

    await page.goto('/rally/profile');

    await expect(page.getByLabel('Código da equipa')).toHaveCount(0);
  });

  test('renders participation history with classification and points', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, {
      ...NO_TEAM_PROFILE,
      current_team_id: 7,
      participations: [
        {
          event_id: 1,
          event_name: 'Rally Tascas 2026',
          event_type: 'rally_tascas',
          team_id: 7,
          team_name: 'Os Fintas',
          is_captain: true,
          joined_at: new Date().toISOString(),
          team_classification: 2,
          team_total: 340,
        },
      ],
    });

    await page.goto('/rally/profile');

    await expect(page.getByText('Rally Tascas 2026')).toBeVisible();
    await expect(page.getByText('2º')).toBeVisible();
    await expect(page.getByText('340')).toBeVisible();
    await expect(page.getByText('Capitão')).toBeVisible();
  });

  test('shows error message when profile history fails to load', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, { detail: 'Server error' }, 500);

    await page.goto('/rally/profile');

    await expect(page.getByText('Não foi possível carregar o histórico.')).toBeVisible();
  });

  test('claiming a team by valid access code lists claimable members', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);
    await page.route('**/api/rally/v1/profile/claimable**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team_id: 7,
          team_name: 'Os Engenhocas',
          members: [
            { id: 11, name: 'Tomás Silva', is_captain: false },
            { id: 12, name: 'Inês Costa', is_captain: true },
          ],
        }),
      }),
    );

    await page.goto('/rally/profile');
    await page.getByLabel('Código da equipa').fill('ABCD-1234');
    await page.getByRole('button', { name: 'Procurar' }).click();

    await expect(page.getByText('Os Engenhocas')).toBeVisible();
    await expect(page.getByRole('button', { name: /Tomás Silva/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Inês Costa/ })).toBeVisible();
  });

  test('invalid access code shows an error', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);
    await page.route('**/api/rally/v1/profile/claimable**', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Código de acesso inválido' }),
      }),
    );

    await page.goto('/rally/profile');
    await page.getByLabel('Código da equipa').fill('WRNG-0000');
    await page.getByRole('button', { name: 'Procurar' }).click();

    await expect(page.getByText('Código de acesso inválido')).toBeVisible();
  });

  test('access code for a team with no unclaimed members shows guidance text', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);
    await page.route('**/api/rally/v1/profile/claimable**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ team_id: 7, team_name: 'Os Fintas', members: [] }),
      }),
    );

    await page.goto('/rally/profile');
    await page.getByLabel('Código da equipa').fill('FULL-0001');
    await page.getByRole('button', { name: 'Procurar' }).click();

    await expect(
      page.getByText('Não há membros por associar nesta equipa. Pede a um responsável para te adicionar.'),
    ).toBeVisible();
  });

  test('claiming a member that was already claimed by someone else surfaces a 409 conflict', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);
    await page.route('**/api/rally/v1/profile/claimable**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team_id: 7,
          team_name: 'Os Engenhocas',
          members: [{ id: 11, name: 'Tomás Silva', is_captain: false }],
        }),
      }),
    );
    await page.route('**/api/rally/v1/profile/claim/11', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Este membro já foi reclamado por outra conta' }),
      }),
    );

    await page.goto('/rally/profile');
    await page.getByLabel('Código da equipa').fill('ABCD-1234');
    await page.getByRole('button', { name: 'Procurar' }).click();
    await page.getByRole('button', { name: /Tomás Silva/ }).click();

    await expect(page.getByText('Este membro já foi reclamado por outra conta')).toBeVisible();
  });

  test('successful claim invalidates and refetches the profile', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    let profileCallCount = 0;
    await page.route('**/api/rally/v1/profile/me', (route) => {
      profileCallCount += 1;
      const body =
        profileCallCount === 1 ? NO_TEAM_PROFILE : { ...NO_TEAM_PROFILE, current_team_id: 7 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/api/rally/v1/profile/claimable**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team_id: 7,
          team_name: 'Os Engenhocas',
          members: [{ id: 11, name: 'Tomás Silva', is_captain: false }],
        }),
      }),
    );
    await page.route('**/api/rally/v1/profile/claim/11', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          event_id: 1,
          event_name: 'Rally Tascas 2026',
          event_type: 'rally_tascas',
          team_id: 7,
          team_name: 'Os Engenhocas',
          is_captain: false,
          joined_at: new Date().toISOString(),
          team_classification: null,
          team_total: null,
        }),
      }),
    );

    await page.goto('/rally/profile');
    await page.getByLabel('Código da equipa').fill('ABCD-1234');
    await page.getByRole('button', { name: 'Procurar' }).click();
    await page.getByRole('button', { name: /Tomás Silva/ }).click();

    await expect(page.getByLabel('Código da equipa')).toHaveCount(0);
  });

  test('renders correctly on mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);
    await seedOidcSession(context, ['rally-participant']);
    await mockProfile(page, NO_TEAM_PROFILE);

    await page.goto('/rally/profile');

    await expect(page.getByText('Tomás Silva')).toBeVisible();
  });
});
