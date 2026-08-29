import { test, expect } from '@playwright/test';
import { mintToken, API_V1 } from './helpers/fullstackAuth';
import { createAndActivateEvent, waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: ABAC boundaries (staff scoped to its own checkpoint,
 * team tokens rejected on admin/staff routes, guide indication answers never
 * leaking publicly) are only exercised in tests/e2e/security-abac.spec.ts
 * against route-mocked responses that assert the frontend redirects/hides UI
 * correctly for a *given* backend response — they never confirm the real
 * backend actually returns that response. A regression in
 * app/api/abac_deps.py or app/api/deps.py (e.g. a staff member's checkpoint
 * check accidentally loosened) would pass every mocked test here.
 *
 * Raw fetch is used (not the apiCall helper, which throws on non-2xx) so
 * each test can assert the *specific* status code the real backend returns.
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

test.describe('ABAC security boundaries against a real backend', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('staff cannot evaluate an activity at a checkpoint they are not assigned to', async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-abac-admin-${runId}`,
      name: 'E2E ABAC Admin',
      groups: ['admin'],
      email: `e2e-abac-admin-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, 'abac');

    const checkpointMine = await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Posto Meu ${runId}`, order: 1, arrival_radius_m: 9999 },
    }).then((r) => r.json() as Promise<{ id: number }>);
    const checkpointOther = await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Posto Alheio ${runId}`, order: 2, arrival_radius_m: 9999 },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const activityOther = await rawFetch('POST', '/activities/', {
      token: admin.accessToken,
      body: {
        name: `E2E Atividade Alheia ${runId}`,
        activity_type: 'BooleanActivity',
        checkpoint_id: checkpointOther.id,
        config: {},
        is_active: true,
      },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const teamOther = await rawFetch('POST', '/team/', {
      token: admin.accessToken,
      body: { name: `E2E Equipa Alheia ${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const staffSub = `e2e-abac-staff-${runId}`;
    const staffEmail = `${staffSub}@ua.pt`;
    const staff = await mintToken({
      sub: staffSub,
      name: 'E2E ABAC Staff',
      groups: ['rally-staff'],
      email: staffEmail,
    });
    await rawFetch('GET', '/profile/me', { token: staff.accessToken });
    const [staffLocalUser] = await rawFetch(
      'GET',
      `/user/search?q=${encodeURIComponent(staffEmail)}`,
      { token: admin.accessToken },
    ).then((r) => r.json() as Promise<{ id: number }[]>);
    if (!staffLocalUser?.id) throw new Error('could not resolve staff local user');
    // Assign staff to checkpointMine, not checkpointOther — the activity and
    // team above belong to a checkpoint this staff member has no claim to.
    await rawFetch('PUT', `/user/${staffLocalUser.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpointMine.id },
    });

    const response = await rawFetch(
      'POST',
      `/staff/teams/${teamOther.id}/activities/${activityOther.id}/evaluate`,
      {
        token: staff.accessToken,
        body: { result_data: { success: true }, extra_shots: 0, penalty_counts: {} },
      },
    );
    // Cross-checkpoint access is reported as 404 (RallyNotFoundError), not
    // 403 — see staff_evaluation.py: the activity is treated as not existing
    // "at your assigned checkpoint" rather than confirming its existence
    // elsewhere. Assert the exact code so a switch to a leakier 403/200
    // wouldn't silently pass a looser check.
    expect(response.status).toBe(404);
  });

  test('a team access-token is rejected by admin and staff-only endpoints', async ({
    context,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-abac-admin2-${runId}`,
      name: 'E2E ABAC Admin Two',
      groups: ['admin'],
      email: `e2e-abac-admin2-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, 'abac-team');
    const team = await rawFetch('POST', '/team/', {
      token: admin.accessToken,
      body: { name: `E2E Equipa ABAC ${runId}` },
    }).then((r) => r.json() as Promise<{ id: number; access_code: string }>);

    // Log the team in via the real login endpoint directly (not the UI
    // form) — the login rate limiter is keyed per client IP across the
    // *whole* test run (rate_limit.py's check_login_rate_limit), and this
    // suite already drives several UI team-logins elsewhere (golden-path,
    // rally-day, guide-and-badges, multi-edicao); one more UI login here
    // risked tipping a full-suite run over the limit. The token itself is
    // still genuinely minted by the real backend — only the delivery
    // mechanism changes, not what's being attacked below.
    const loginResponse = await rawFetch('POST', '/team-auth/login', {
      body: { access_code: team.access_code },
    }).then((r) => r.json() as Promise<{ access_token: string }>);
    const teamToken = loginResponse.access_token;
    expect(teamToken).toBeTruthy();

    const adminEndpointResponse = await rawFetch('POST', '/checkpoint/', {
      token: teamToken ?? undefined,
      body: { name: 'Should not be created', order: 1, arrival_radius_m: 50 },
    });
    expect([401, 403]).toContain(adminEndpointResponse.status);

    const staffEndpointResponse = await rawFetch('GET', '/staff/teams', {
      token: teamToken ?? undefined,
    });
    expect([401, 403]).toContain(staffEndpointResponse.status);

    // The frontend itself must also refuse to render the admin UI for this
    // token, not just rely on the backend rejecting the underlying calls.
    const adminContext = await context.browser()?.newContext();
    if (!adminContext) throw new Error('could not open a fresh context');
    await adminContext.addInitScript((token: string) => {
      localStorage.setItem('rally_team_token', token);
    }, teamToken as string);
    const adminPage = await adminContext.newPage();
    try {
      await adminPage.goto('/rally/admin');
      // The fallback target depends on show_score_mode (useFallbackNavigation:
      // "/checkpoints" when hidden, the fresh event's default; "/scoreboard"
      // otherwise) — the ABAC boundary under test is that /admin itself is
      // never reachable, not which specific page it bounces to.
      await adminPage.waitForURL(/\/(scoreboard|checkpoints)$/, { timeout: 15_000 });
      await expect(adminPage).not.toHaveURL(/\/admin/);
    } finally {
      await adminContext.close();
    }
  });

  test("a checkpoint's public payload never includes guide indication answers", async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-abac-admin3-${runId}`,
      name: 'E2E ABAC Admin Three',
      groups: ['admin'],
      email: `e2e-abac-admin3-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, 'abac-guide');
    const checkpoint = await rawFetch('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Posto Segredo ${runId}`, order: 1, arrival_radius_m: 9999 },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const secretAnswer = `segredo-${runId}`;
    await rawFetch('POST', `/checkpoint/${checkpoint.id}/guide-indications`, {
      token: admin.accessToken,
      body: {
        hint: 'Aponta para a estátua',
        question: 'Quem é o santo padroeiro?',
        expected_answer: secretAnswer,
        order: 1,
      },
    });

    // The authenticated guide-only endpoint does carry the answer …
    const guideIndications = await rawFetch(
      'GET',
      `/checkpoint/${checkpoint.id}/guide-indications`,
      { token: admin.accessToken },
    ).then((r) => r.text());
    expect(guideIndications).toContain(secretAnswer);

    // … but the public checkpoint listing must never include it, regardless
    // of how the guide-indications feature evolves server-side.
    const publicCheckpoints = await rawFetch('GET', '/checkpoint/').then((r) => r.text());
    expect(publicCheckpoints).not.toContain(secretAnswer);
    expect(publicCheckpoints).not.toContain('expected_answer');
  });
});
