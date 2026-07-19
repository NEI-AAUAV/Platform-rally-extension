import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';
import type { RallySettingsResponse } from '@/client';

async function seedTeamAuth(context: BrowserContext, teamId = 3, teamName = 'Os Fixes') {
  await context.addInitScript(
    ([id, name]) => {
      localStorage.setItem('rally_team_token', 'team-jwt');
      localStorage.setItem('rally_team_data', JSON.stringify({ team_id: id, team_name: name }));
    },
    [teamId, teamName] as [number, string],
  );
}

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }),
  );
  // main.tsx fires a team-token refresh on every load; on failure it clears
  // the team session, flaking any test slow enough for that fetch to resolve.
  await page.route('**/api/rally/v1/team-auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'team-jwt' }) }),
  );
}

const CHECKPOINTS = [
  {
    id: 1,
    name: 'Posto 1',
    description: 'First checkpoint',
    latitude: 40.63,
    longitude: -8.65,
    order: 1,
    arrival_radius_m: 50,
  },
  {
    id: 2,
    name: 'Posto 2',
    description: 'Second checkpoint',
    latitude: 40.64,
    longitude: -8.66,
    order: 2,
    arrival_radius_m: 50,
  },
];

function team(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    name: 'Os Fixes',
    total: 120,
    times: ['00:12:30', null],
    members: [{ id: 1, name: 'João', is_captain: true, is_linked: false }],
    num_members: 1,
    classification: 1,
    question_scores: [],
    time_scores: [],
    pukes: [],
    skips: [],
    score_per_checkpoint: [30, 0],
    last_checkpoint_number: 1,
    current_checkpoint_number: 2,
    ...overrides,
  };
}

async function mockTeamProgressApis(
  page: Page,
  options: { teamId?: number; teamBody?: unknown; checkpoints?: unknown[] } = {},
) {
  const teamId = options.teamId ?? 3;
  await page.route(`**/api/rally/v1/team/${teamId}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.teamBody ?? team()),
    }),
  );
  await page.route('**/api/rally/v1/checkpoint/**', (route) => {
    const url = route.request().url();
    if (url.includes('/media')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/count')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(2) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.checkpoints ?? CHECKPOINTS),
    });
  });
}

test.describe('Team progress', () => {
  test('redirects to scoreboard when participant view is disabled', async ({ page, context }) => {
    // useTeamProgress's effect redirects to /scoreboard as soon as settings
    // resolve with participant_view_enabled: false — it wins the race against
    // the render-time StatusScreen branch in index.tsx, which is unreachable
    // via this path in practice.
    await mockSettings(page, { participant_view_enabled: false });
    await seedTeamAuth(context);
    await mockTeamProgressApis(page);

    await page.goto('/rally/team-progress');

    await page.waitForURL('**/scoreboard');
  });

  test('shows error status screen when team fetch fails', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await page.route('**/api/rally/v1/team/3**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );
    await page.route('**/api/rally/v1/checkpoint/**', (route) => {
      const url = route.request().url();
      if (url.includes('/count')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(2) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKPOINTS) });
    });

    await page.goto('/rally/team-progress');

    await expect(page.getByText('Erro ao carregar')).toBeVisible();
  });

  test('renders team header, route and next checkpoint on happy path', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await mockTeamProgressApis(page);

    await page.goto('/rally/team-progress');

    await expect(page.getByText('Os Fixes')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Percurso' })).toBeVisible();
    await expect(page.getByText('Próximo Posto — Posto 2')).toBeVisible();
    await expect(page.getByText('Concluído')).toBeVisible();
    await expect(page.getByText('Em curso')).toBeVisible();
  });

  test('hides score badges when show_score_mode is hidden', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true, show_score_mode: 'hidden' });
    await seedTeamAuth(context);
    await mockTeamProgressApis(page);

    await page.goto('/rally/team-progress');

    await expect(page.getByText('+30 pts')).toHaveCount(0);
  });

  test('shows score badge for completed checkpoint when score mode is visible', async ({
    page,
    context,
  }) => {
    await mockSettings(page, { participant_view_enabled: true, show_score_mode: 'all' });
    await seedTeamAuth(context);
    await mockTeamProgressApis(page);

    await page.goto('/rally/team-progress');

    await expect(page.getByText('+30 pts')).toBeVisible();
  });

  test('successful GPS check-in shows auto-completed message', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.64, longitude: -8.66 });
    await mockTeamProgressApis(page);
    await page.route('**/api/rally/v1/checkpoint/2/arrive', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_completed: true, already_registered: false, distance_m: 12.3 }),
      }),
    );

    await page.goto('/rally/team-progress');
    await page.getByRole('button', { name: 'Check-in GPS' }).click();

    await expect(page.getByText('Posto concluído! A avançar para o próximo…')).toBeVisible();
  });

  test('already-registered GPS check-in shows distance message', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.64, longitude: -8.66 });
    await mockTeamProgressApis(page);
    await page.route('**/api/rally/v1/checkpoint/2/arrive', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_completed: false, already_registered: true, distance_m: 8 }),
      }),
    );

    await page.goto('/rally/team-progress');
    await page.getByRole('button', { name: 'Check-in GPS' }).click();

    await expect(page.getByText('Já registado. Distância: 8 m.')).toBeVisible();
  });

  test('too-far GPS check-in shows translated distance error', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.7, longitude: -8.7 });
    await mockTeamProgressApis(page);
    await page.route('**/api/rally/v1/checkpoint/2/arrive', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Too far from checkpoint: 240m (max 50m)' }),
      }),
    );

    await page.goto('/rally/team-progress');
    await page.getByRole('button', { name: 'Check-in GPS' }).click();

    await expect(
      page.getByText('Ainda estás longe do posto: 240 m (tens de estar a menos de 50 m). Aproxima-te e tenta outra vez.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });

  test('shows loading skeleton while auth/team/settings resolve', async ({ page, context }) => {
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await page.route('**/api/rally/v1/team/3**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team()) });
    });
    await page.route('**/api/rally/v1/checkpoint/**', (route) => {
      const url = route.request().url();
      if (url.includes('/count')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(2) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKPOINTS) });
    });

    await page.goto('/rally/team-progress');

    // Skeleton renders instead of the real header while the team query is pending.
    await expect(page.getByText('Os Fixes')).toHaveCount(0);
  });

  test('redirects to team-login when not authenticated', async ({ page }) => {
    await mockSettings(page, { participant_view_enabled: true });

    await page.goto('/rally/team-progress');

    await page.waitForURL('**/team-login');
  });

  test('renders correctly on mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page, { participant_view_enabled: true });
    await seedTeamAuth(context);
    await mockTeamProgressApis(page);

    await page.goto('/rally/team-progress');

    await expect(page.getByText('Os Fixes')).toBeVisible();
  });
});
