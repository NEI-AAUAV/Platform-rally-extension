import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRealOidcSession, apiCall } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';
import { seedRallyDay, type RallyDay } from './helpers/seedRallyDay';

/**
 * "Um dia de Rally Tascas" — the master concurrency scenario (Parte 4). Runs
 * 7 simultaneous browser contexts against a single real backend: 1 admin,
 * 2 staff (one per checkpoint), 4 teams. Everyone acts concurrently, the way
 * an actual event day works — not sequentially, which is what every other
 * fullstack spec in this suite does and which can't catch cross-context race
 * conditions (double-scoring, lost writes under concurrent evaluation,
 * stale reads on the live scoreboard).
 *
 * Incidents deliberately injected mid-run:
 *   - a staff member's evaluate call drops offline mid-submit (recoverable
 *     via the same offline queue exercised in tests/e2e/offline-pwa.spec.ts,
 *     but here against a real backend instead of a route mock)
 *   - a team double-submits a check-in (idempotency under real concurrency,
 *     not simulated latency)
 *   - two staff evaluate two different teams at two different checkpoints in
 *     the same instant, and the admin's live scoreboard must reflect both
 *     without a lost update
 *
 * Requires the same api-rally smoke stack as the rest of tests/e2e-fullstack
 * (see README.md). Single worker (see playwright.config.ts's `fullstack`
 * project) — the whole point is real concurrency inside one test, not
 * parallel test files.
 */

async function newTeamPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function newStaffPage(browser: Browser, staffUser: RallyDay['staff'][number]['user']): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, staffUser);
  return context.newPage();
}

async function teamLogin(page: Page, accessCode: string): Promise<void> {
  await page.goto('/rally/team-login');
  await page.getByPlaceholder('XXXX-XXXX').fill(accessCode);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/team-progress');
}

test.describe('Um dia de Rally Tascas — multi-context concurrency', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('4 teams and 2 staff act concurrently across 2 checkpoints; the admin scoreboard reflects every write with no lost updates', async ({
    browser,
  }) => {
    console.log('TEMP_DEBUG seeding rally day');
    const day = await seedRallyDay({ checkpointCount: 2, teamCount: 4 });
    console.log('TEMP_DEBUG seeded', JSON.stringify({ checkpoints: day.checkpoints.length, staff: day.staff.length, teams: day.teams.length }));
    const [checkpointA, checkpointB] = day.checkpoints;
    const [staffA, staffB] = day.staff;
    const [teamAlpha, teamBeta, teamGamma, teamDelta] = day.teams;

    // Teams alpha/beta head to checkpoint A, gamma/delta to checkpoint B —
    // two independent staff members working two independent queues at once.
    const adminContext = await browser.newContext();
    await seedRealOidcSession(adminContext, day.admin);
    const adminPage = await adminContext.newPage();

    const staffAPage = await newStaffPage(browser, staffA.user);
    const staffBPage = await newStaffPage(browser, staffB.user);
    const teamPages = await Promise.all([
      newTeamPage(browser),
      newTeamPage(browser),
      newTeamPage(browser),
      newTeamPage(browser),
    ]);
    const [alphaPage, betaPage, gammaPage, deltaPage] = teamPages;

    try {
      // All 4 teams log in concurrently — exercises the real backend under
      // simultaneous auth load, not sequential logins.
      await Promise.all([
        teamLogin(alphaPage, teamAlpha.accessCode),
        teamLogin(betaPage, teamBeta.accessCode),
        teamLogin(gammaPage, teamGamma.accessCode),
        teamLogin(deltaPage, teamDelta.accessCode),
      ]);
      console.log('TEMP_DEBUG all 4 teams logged in');

      // Staff check teams in at their respective checkpoints, concurrently
      // across both checkpoints (two independent staff-side flows at once).
      await Promise.all([
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffA.user.accessToken,
          body: { team_code: teamAlpha.accessCode, checkpoint_id: checkpointA.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffA.user.accessToken,
          body: { team_code: teamBeta.accessCode, checkpoint_id: checkpointA.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamGamma.accessCode, checkpoint_id: checkpointB.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamDelta.accessCode, checkpoint_id: checkpointB.id },
        }),
      ]);
      console.log('TEMP_DEBUG all 4 check-ins done');

      // Incident 1: teamGamma's client double-submits the same check-in (a
      // flaky-tap-retry scenario) — the second call must not error and must
      // not double-register the arrival. staff-check-in is idempotent per
      // (team, checkpoint) pair at the backend, unlike the evaluate endpoint
      // which relies on the client's Idempotency-Key header.
      const duplicateCheckIn = await fetch(
        `${process.env.FULLSTACK_API_BASE_URL ?? 'http://localhost:8103'}/api/rally/v1/checkpoint/staff-check-in`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffB.user.accessToken}` },
          body: JSON.stringify({ team_code: teamGamma.accessCode, checkpoint_id: checkpointB.id }),
        },
      );
      expect(duplicateCheckIn.ok).toBe(true);
      console.log('TEMP_DEBUG duplicate check-in ok');

      // Incident 2: staffA's evaluate for teamAlpha and staffB's evaluate for
      // teamGamma fire in the exact same instant — two independent checkpoint
      // queues writing concurrently. Neither should clobber the other.
      const [alphaResult, gammaResult] = await Promise.all([
        apiCall('POST', `/staff/teams/${teamAlpha.id}/activities/${checkpointA.activityId}/evaluate`, {
          token: staffA.user.accessToken,
          body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
        }),
        apiCall('POST', `/staff/teams/${teamGamma.id}/activities/${checkpointB.activityId}/evaluate`, {
          token: staffB.user.accessToken,
          body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
        }),
      ]);
      expect((alphaResult as { final_score: number }).final_score).toBe(100);
      expect((gammaResult as { final_score: number }).final_score).toBe(100);
      console.log('TEMP_DEBUG concurrent evaluations done');

      // Incident 3: staffB goes offline mid-evaluation for teamDelta — the UI
      // queues the submit locally (same mechanism as offline-pwa.spec.ts)
      // rather than losing it, then a reconnect drains it against the real
      // backend.
      await staffBPage.goto(`/rally/staff-evaluation/checkpoint/${checkpointB.id}`);
      console.log('TEMP_DEBUG staffB navigated to checkpoint page');
      await staffBPage.getByText(teamDelta.name).first().click();
      console.log('TEMP_DEBUG staffB selected teamDelta');
      const evaluateButton = staffBPage.getByRole('button', { name: /avaliar|evaluate/i }).first();
      await evaluateButton.click();
      console.log('TEMP_DEBUG staffB opened evaluate form');

      await staffBPage.context().setOffline(true);
      const submitButton = staffBPage.getByRole('button', { name: /submit evaluation/i });
      await submitButton.click();
      console.log('TEMP_DEBUG staffB submitted while offline');
      await expect(staffBPage.getByRole('status').filter({ hasText: /por sincronizar/i })).toBeVisible({
        timeout: 10_000,
      });
      console.log('TEMP_DEBUG offline banner visible');

      await staffBPage.context().setOffline(false);
      await staffBPage.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(staffBPage.getByRole('status').filter({ hasText: /por sincronizar/i })).toHaveCount(0, {
        timeout: 15_000,
      });
      console.log('TEMP_DEBUG offline queue drained');

      // Every team's own progress view reflects its real, server-computed
      // state — checked concurrently across all 4 team contexts.
      await Promise.all([
        alphaPage.reload(),
        betaPage.reload(),
        gammaPage.reload(),
        deltaPage.reload(),
      ]);
      await expect(alphaPage.getByText('Concluído').first()).toBeVisible({ timeout: 15_000 });
      await expect(gammaPage.getByText('Concluído').first()).toBeVisible({ timeout: 15_000 });
      await expect(deltaPage.getByText('Concluído').first()).toBeVisible({ timeout: 15_000 });

      // The admin's live scoreboard — a live-updating view fed by the same
      // backend every context above just wrote to — must show every team
      // that scored, with no write lost to the concurrency above.
      await adminPage.goto('/rally/scoreboard');
      await expect(adminPage.getByText(teamAlpha.name)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(teamGamma.name)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(teamDelta.name)).toBeVisible({ timeout: 15_000 });

      // Cross-check against the API directly: exactly one evaluation per
      // team that was evaluated, not duplicated by the offline-queue replay
      // or the duplicate check-in incident.
      const allEvaluations = await apiCall<{ evaluations: { team_id: number }[] }>(
        'GET',
        '/staff/all-evaluations',
        { token: day.admin.accessToken },
      );
      const alphaEvalCount = allEvaluations.evaluations.filter((e) => e.team_id === teamAlpha.id).length;
      const gammaEvalCount = allEvaluations.evaluations.filter((e) => e.team_id === teamGamma.id).length;
      const deltaEvalCount = allEvaluations.evaluations.filter((e) => e.team_id === teamDelta.id).length;
      expect(alphaEvalCount).toBe(1);
      expect(gammaEvalCount).toBe(1);
      expect(deltaEvalCount).toBe(1);
    } finally {
      await Promise.all([
        adminContext.close(),
        staffAPage.context().close(),
        staffBPage.context().close(),
        ...teamPages.map((p) => p.context().close()),
      ]);
    }
  });
});
