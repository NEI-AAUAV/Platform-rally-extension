import { test, expect } from '@playwright/test';
import { mintToken, seedRealOidcSession, API_V1 } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: multi-edition isolation is only exercised in
 * tests/e2e/multi-edicao.spec.ts against route-mocked responses that assert
 * the frontend refetches/redisplays whatever the mock hands it — never that
 * the real backend's per-event scoping (crud_team.get_multi's event_id
 * filter, checkin.py's _require_same_event guard) actually works.
 *
 * Along the way this surfaced a real discrepancy with the mocked suite: its
 * "an access code from a non-current edition is rejected by team login" test
 * asserts something the real backend does not do. crud_team.get_by_access_code
 * looks a team up globally by its (globally-unique) access_code with no event
 * filter at all — team login is intentionally edition-agnostic; isolation is
 * enforced at listing/ranking (get_multi) and check-in
 * (_require_same_event), not at login. This spec tests the real boundary
 * instead of the mocked assumption.
 */

async function rawFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${API_V1}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

test.describe('Multi-edition isolation against a real backend', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('switching the current edition changes which checkpoints and teams the admin UI shows', async ({
    page,
    context,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-me-admin-${runId}`,
      name: 'E2E Multi-Edition Admin',
      groups: ['admin'],
      email: `e2e-me-admin-${runId}@ua.pt`,
    });
    await seedRealOidcSession(context, admin);

    const eventAName = `E2E Edição A ${runId}`;
    const eventBName = `E2E Edição B ${runId}`;
    const eventA = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: eventAName, slug: `e2e-edicao-a-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${eventA.id}/set-current`, { token: admin.accessToken });

    const checkpointAName = `E2E Posto Edição A ${runId}`;
    await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: checkpointAName, order: 1, arrival_radius_m: 9999 },
    });

    const eventB = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: eventBName, slug: `e2e-edicao-b-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${eventB.id}/set-current`, { token: admin.accessToken });

    const checkpointBName = `E2E Posto Edição B ${runId}`;
    await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: checkpointBName, order: 1, arrival_radius_m: 9999 },
    });

    // Edition B is current now — its checkpoint must show, A's must not.
    await page.goto('/rally/admin?tab=checkpoints');
    await expect(page.getByText(checkpointBName)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(checkpointAName)).toHaveCount(0);

    // Switch back to A through the real UI (not the API) and confirm the
    // swap reverses on a fresh navigation — no manual reload.
    await page.goto('/rally/admin?tab=events');
    const eventACard = page.locator('.rally-surface', { hasText: eventAName });
    await eventACard.getByRole('button', { name: 'Tornar atual' }).click();
    await expect(eventACard.getByText('Atual', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.goto('/rally/admin?tab=checkpoints');
    await expect(page.getByText(checkpointAName)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(checkpointBName)).toHaveCount(0);
  });

  test('a team from a non-current edition can still log in (access codes are global), but is absent from the current edition\'s team listing', async ({
    page,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-me-admin2-${runId}`,
      name: 'E2E Multi-Edition Admin Two',
      groups: ['admin'],
      email: `e2e-me-admin2-${runId}@ua.pt`,
    });

    const oldEvent = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Edição Antiga ${runId}`, slug: `e2e-edicao-antiga-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${oldEvent.id}/set-current`, { token: admin.accessToken });
    const oldTeamName = `E2E Equipa Antiga ${runId}`;
    const oldTeam = await rawFetch('POST', '/team/', {
      token: admin.accessToken,
      body: { name: oldTeamName },
    }).then((r) => r.json() as Promise<{ id: number; access_code: string }>);

    const newEvent = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Edição Nova ${runId}`, slug: `e2e-edicao-nova-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${newEvent.id}/set-current`, { token: admin.accessToken });

    // Login is intentionally edition-agnostic (crud_team.get_by_access_code
    // has no event filter) — the old team's code still works.
    await page.goto('/rally/team-login');
    await page.getByPlaceholder('XXXX-XXXX').fill(oldTeam.access_code);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/team-progress');

    // But the new (current) edition's public team listing never surfaces it
    // — isolation is enforced at listing, not login.
    const currentTeams = await rawFetch('GET', '/team/', { token: admin.accessToken }).then(
      (r) => r.json() as Promise<{ name: string }[]>,
    );
    expect(currentTeams.some((t) => t.name === oldTeamName)).toBe(false);
  });

  test('checking a team in at a checkpoint from a different edition is rejected', async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-me-admin3-${runId}`,
      name: 'E2E Multi-Edition Admin Three',
      groups: ['admin'],
      email: `e2e-me-admin3-${runId}@ua.pt`,
    });

    const eventA = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Edição Cross A ${runId}`, slug: `e2e-edicao-cross-a-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${eventA.id}/set-current`, { token: admin.accessToken });
    const team = await rawFetch('POST', '/team/', {
      token: admin.accessToken,
      body: { name: `E2E Equipa Cross ${runId}` },
    }).then((r) => r.json() as Promise<{ access_code: string }>);

    const eventB = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Edição Cross B ${runId}`, slug: `e2e-edicao-cross-b-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${eventB.id}/set-current`, { token: admin.accessToken });
    const checkpointB = await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Posto Cross B ${runId}`, order: 1, arrival_radius_m: 9999 },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const staffSub = `e2e-me-staff-${runId}`;
    const staff = await mintToken({
      sub: staffSub,
      name: 'E2E Multi-Edition Staff',
      groups: ['rally-staff'],
      email: `${staffSub}@ua.pt`,
    });
    await rawFetch('GET', '/profile/me', { token: staff.accessToken });
    const [staffLocalUser] = await rawFetch(
      'GET',
      `/user/search?q=${encodeURIComponent(`${staffSub}@ua.pt`)}`,
      { token: admin.accessToken },
    ).then((r) => r.json() as Promise<{ id: number }[]>);
    if (!staffLocalUser?.id) throw new Error('could not resolve staff local user');
    await rawFetch('PUT', `/user/${staffLocalUser.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpointB.id },
    });

    // team belongs to eventA; checkpointB belongs to eventB — cross-event
    // check-in must be rejected (_require_same_event -> 404), not silently
    // advance the team into an edition it isn't part of.
    const response = await rawFetch('POST', '/checkpoint/staff-check-in', {
      token: staff.accessToken,
      body: { team_code: team.access_code, checkpoint_id: checkpointB.id },
    });
    expect(response.status).toBe(404);
  });
});
