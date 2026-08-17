import { test, expect } from '@playwright/test';
import { mintToken, seedRealOidcSession, apiCall } from './helpers/fullstackAuth';
import { createAndActivateEvent, waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: SSE-driven live scoreboard updates
 * (useScoreboardStream, backed by /scoreboard/stream) are only exercised
 * against a mocked EventSource in tests/e2e/resilience.spec.ts. Nothing
 * confirms the real backend actually emits a `refresh` event over SSE when
 * an evaluation is submitted, or that the real EventSource wiring in the
 * browser picks it up — a regression in app/events/publisher.py or the
 * SSE route itself would pass every mocked test.
 *
 * The docker-compose.smoke.yml stack already runs with EVENTS_ENABLED=true,
 * so this is the one fullstack spec that can validate the real SSE path
 * end-to-end: a public viewer's scoreboard page, opened once and never
 * reloaded, must reflect a staff evaluation submitted after the page loaded.
 */

test.describe('Live scoreboard updates via real SSE', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('a staff evaluation pushes a live update to an already-open public scoreboard, no reload', async ({
    browser,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-sse-admin-${runId}`,
      name: 'E2E SSE Admin',
      groups: ['admin'],
      email: `e2e-sse-admin-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, 'sse');

    const checkpoint = await apiCall<{ id: number }>('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Posto SSE ${runId}`, order: 1, arrival_radius_m: 9999 },
    });
    // The checkpoint needs an evaluable activity for the staff-evaluation UI
    // to offer it, but its id is never referenced directly — staff picks the
    // team from the checkpoint's team list, not by activity id.
    await apiCall('POST', '/activities/', {
      token: admin.accessToken,
      body: {
        name: `E2E Atividade SSE ${runId}`,
        activity_type: 'BooleanActivity',
        checkpoint_id: checkpoint.id,
        config: {},
        is_active: true,
      },
    });

    const staffSub = `e2e-sse-staff-${runId}`;
    const staffEmail = `${staffSub}@ua.pt`;
    const staff = await mintToken({
      sub: staffSub,
      name: 'E2E SSE Staff',
      groups: ['rally-staff'],
      email: staffEmail,
    });
    await apiCall('GET', '/profile/me', { token: staff.accessToken });
    const [staffLocalUser] = await apiCall<{ id: number }[]>(
      'GET',
      `/user/search?q=${encodeURIComponent(staffEmail)}`,
      { token: admin.accessToken },
    );
    if (!staffLocalUser?.id) throw new Error('could not resolve staff local user');
    await apiCall('PUT', `/user/${staffLocalUser.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpoint.id },
    });

    const teamName = `E2E Equipa SSE ${runId}`;
    await apiCall('POST', '/team/', { token: admin.accessToken, body: { name: teamName } });

    const currentSettings = await apiCall<Record<string, unknown>>('GET', '/rally/settings', {
      token: admin.accessToken,
    });
    await apiCall('PUT', '/rally/settings', {
      token: admin.accessToken,
      body: {
        ...currentSettings,
        show_live_leaderboard: true,
        public_access_enabled: true,
        show_score_mode: 'competitive',
      },
    });

    const staffContext = await browser.newContext();
    await seedRealOidcSession(staffContext, staff);
    const staffPage = await staffContext.newPage();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();

    try {
      // Public viewer opens the scoreboard first and never reloads — any
      // update it sees from here on can only have arrived via the SSE push,
      // not a fresh page load re-fetching current state.
      await publicPage.goto('/rally/scoreboard');
      await expect(publicPage.getByText(teamName)).toBeVisible({ timeout: 20_000 });

      await staffPage.goto(`/rally/staff-evaluation/checkpoint/${checkpoint.id}`);
      await staffPage.getByText(teamName).first().click();
      await staffPage.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
      await staffPage.getByText('Equipa teve sucesso na atividade').first().click();
      await staffPage.getByRole('button', { name: /submit evaluation|submeter avaliação|atualizar avaliação/i }).click();
      // Wait for the submission to actually complete server-side before
      // asserting on the scoreboard — otherwise the read below can race the
      // in-flight save.
      await staffPage.getByText('Voltar às equipas').click();

      // The public page was never told to reload or refetch manually — if
      // its points total updates, it can only be the SSE `refresh` event
      // driving a query invalidation (useScoreboardStream). The real backend
      // cache (see /scoreboard/live's docstring) is confirmed authoritative
      // via a direct read below; this loop just waits for the *browser*
      // page — which was never reloaded — to reflect that same update.
      await expect(async () => {
        const scoreboard = await apiCall<{ team_name: string; total_score: number }[]>(
          'GET',
          '/scoreboard/live',
          { token: admin.accessToken },
        );
        const teamScore = scoreboard.find((t) => t.team_name === teamName);
        expect(teamScore?.total_score).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });

      // Both the podium (top 3, Link cards) and the full list (ScoreRows,
      // rally-surface rows) render the team name and its "N pts" figure
      // inside the same link/row — walk up to that common ancestor via the
      // <a> the team name always sits inside (Podium and ScoreRows both link
      // to /teams/$id).
      const teamCard = publicPage.locator('a', { hasText: teamName });
      await expect(teamCard.getByText(/pts/)).not.toHaveText('0 pts', { timeout: 20_000 });
    } finally {
      await Promise.all([staffContext.close(), publicContext.close()]);
    }
  });
});
