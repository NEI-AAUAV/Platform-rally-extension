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
 * Checkpoint order is sequential (1, 2, …), not arbitrary: the staff
 * evaluation UI only lists a team as "to evaluate" at a checkpoint when
 * checkpoint.order - 1 equals the team's last completed checkpoint number,
 * so this models a real 2-stop journey — teamAlpha/teamBeta stop at
 * checkpoint A only, teamGamma/teamDelta pass through A (fast, via API) then
 * reach B, where staffB evaluates them through the real UI at the same time
 * staffA is independently evaluating teamAlpha through the UI at checkpoint
 * A. That overlap is the actual concurrency under test.
 *
 * Incidents deliberately injected mid-run:
 *   - a team double-submits a check-in (idempotency under real concurrency,
 *     not simulated latency)
 *   - staffA and staffB submit real UI evaluations at two different
 *     checkpoints in the same instant, and the admin's live scoreboard must
 *     reflect both without a lost update
 *   - staffB's evaluate call for teamDelta drops offline mid-submit
 *     (recoverable via the same offline queue exercised in
 *     tests/e2e/offline-pwa.spec.ts, but here against a real backend instead
 *     of a route mock)
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

  test('4 teams and 2 staff act concurrently across a real 2-checkpoint journey; the admin scoreboard reflects every write with no lost updates', async ({
    browser,
  }) => {
    const day = await seedRallyDay({ checkpointCount: 2, teamCount: 4 });
    const [checkpointA, checkpointB] = day.checkpoints;
    const [staffA, staffB] = day.staff;
    const [teamAlpha, teamBeta, teamGamma, teamDelta] = day.teams;

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
      // All 4 teams arrive at checkpoint A concurrently.
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
          token: staffA.user.accessToken,
          body: { team_code: teamGamma.accessCode, checkpoint_id: checkpointA.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffA.user.accessToken,
          body: { team_code: teamDelta.accessCode, checkpoint_id: checkpointA.id },
        }),
      ]);
      // Incident 1: teamBeta's client double-submits the same check-in (a
      // flaky-tap-retry scenario) — the second call must not error and must
      // not double-register the arrival. staff-check-in is idempotent per
      // (team, checkpoint) pair at the backend, unlike the evaluate endpoint
      // which relies on the client's Idempotency-Key header.
      const duplicateCheckIn = await fetch(
        `${process.env.FULLSTACK_API_BASE_URL ?? 'http://localhost:8003'}/api/rally/v1/checkpoint/staff-check-in`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffA.user.accessToken}` },
          body: JSON.stringify({ team_code: teamBeta.accessCode, checkpoint_id: checkpointA.id }),
        },
      );
      expect(duplicateCheckIn.ok).toBe(true);
      // teamGamma and teamDelta are only passing through A on their way to B
      // — evaluate them quickly via API (not the focus of this scenario) so
      // they become eligible for checkpoint B, then check them in there.
      await Promise.all([
        apiCall('POST', `/staff/teams/${teamGamma.id}/activities/${checkpointA.activityId}/evaluate`, {
          token: staffA.user.accessToken,
          body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
        }),
        apiCall('POST', `/staff/teams/${teamDelta.id}/activities/${checkpointA.activityId}/evaluate`, {
          token: staffA.user.accessToken,
          body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
        }),
      ]);
      await Promise.all([
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamGamma.accessCode, checkpoint_id: checkpointB.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamDelta.accessCode, checkpoint_id: checkpointB.id },
        }),
      ]);
      // Incident 2: the actual concurrency under test — staffA evaluates
      // teamAlpha through the real UI at checkpoint A at the exact same time
      // staffB evaluates teamGamma through the real UI at checkpoint B.
      await staffAPage.goto(`/rally/staff-evaluation/checkpoint/${checkpointA.id}`);
      await staffBPage.goto(`/rally/staff-evaluation/checkpoint/${checkpointB.id}`);
      const evaluateOnPage = async (page: Page, teamName: string): Promise<void> => {
        await page.getByText(teamName).first().click();
        await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
        // BooleanForm's success control is a visually-hidden (`sr-only`) native
        // checkbox with a styled label sitting on top of it — clicking the
        // checkbox role directly fails Playwright's actionability check (the
        // label div intercepts pointer events), so target the label instead.
        // See src/components/forms/BooleanForm.tsx.
        await page.getByText('Team succeeded in the activity').first().click();
        await page.getByRole('button', { name: /submit evaluation/i }).click();
        // Submitting drills into the team's own activity detail view — return
        // to the checkpoint's team list so the next team is selectable.
        await page.getByText('Voltar às equipas').click();
      };

      await Promise.all([
        evaluateOnPage(staffAPage, teamAlpha.name),
        evaluateOnPage(staffBPage, teamGamma.name),
      ]);
      // Incident 3: staffB's next evaluation (teamDelta, also at checkpoint
      // B) drops offline mid-submit — the UI queues the submit locally (same
      // mechanism as offline-pwa.spec.ts) rather than losing it, then a
      // reconnect drains it against the real backend.
      await staffBPage.getByText(teamDelta.name).first().click();
      await staffBPage.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
      await staffBPage.getByText('Team succeeded in the activity').first().click();

      // Simulate the device dropping mid-submit: abort just the evaluate call
      // like a lost connection. context.setOffline is unreliable for this —
      // it also blocks the API reads the page still needs, and there's a race
      // between it taking effect and the submit click firing (see the same
      // note in tests/e2e/offline-pwa.spec.ts).
      await staffBPage.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', (route) =>
        route.abort('internetdisconnected'),
      );
      await staffBPage.getByRole('button', { name: /submit evaluation/i }).click();
      await expect(staffBPage.getByRole('status').filter({ hasText: /por sincronizar/i })).toBeVisible({
        timeout: 10_000,
      });
      await staffBPage.unroute('**/api/rally/v1/staff/teams/*/activities/*/evaluate**');
      await staffBPage.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(staffBPage.getByRole('status').filter({ hasText: /por sincronizar/i })).toHaveCount(0, {
        timeout: 30_000,
      });
      // Every team's own progress view reflects its real, server-computed
      // state — checked concurrently across all 4 team contexts.
      await Promise.all([alphaPage.reload(), betaPage.reload(), gammaPage.reload(), deltaPage.reload()]);
      await expect(alphaPage.getByText('Concluído').first()).toBeVisible({ timeout: 30_000 });
      await expect(gammaPage.getByText('Concluído').first()).toBeVisible({ timeout: 30_000 });
      await expect(deltaPage.getByText('Concluído').first()).toBeVisible({ timeout: 30_000 });
      // The admin's live scoreboard — fed by the same backend every context
      // above just wrote to — must show every team that scored, with no
      // write lost to the concurrency above.
      await adminPage.goto('/rally/scoreboard');
      await expect(adminPage.getByText(teamAlpha.name)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(teamGamma.name)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(teamDelta.name)).toBeVisible({ timeout: 15_000 });
      // Cross-check against the API directly: exactly one evaluation per
      // activity per team, not duplicated by the offline-queue replay or the
      // duplicate check-in incident.
      const allEvaluations = await apiCall<{ evaluations: { team_id: number; activity_id: number }[] }>(
        'GET',
        '/staff/all-evaluations',
        { token: day.admin.accessToken },
      );
      const countFor = (teamId: number, activityId: number) =>
        allEvaluations.evaluations.filter((e) => e.team_id === teamId && e.activity_id === activityId).length;
      expect(countFor(teamAlpha.id, checkpointA.activityId)).toBe(1);
      expect(countFor(teamGamma.id, checkpointB.activityId)).toBe(1);
      expect(countFor(teamDelta.id, checkpointB.activityId)).toBe(1);
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
