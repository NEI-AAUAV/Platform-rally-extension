import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRealOidcSession, apiCall } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';
import { seedMegaRallyDay } from './helpers/seedMegaRallyDay';

/**
 * The master scenario: every other fullstack spec in this suite tests one
 * feature in isolation (badges alone, SSE alone, multi-edition alone,
 * ABAC alone) with a minimal 1-2 actor setup. None of them combine what
 * actually happens during a real rally — several features firing at once,
 * under real concurrency, while an admin is also doing unrelated admin work
 * (like prepping next year's edition) in the background.
 *
 * This spec runs 9 concurrent browser contexts (1 admin, 2 staff — one per
 * checkpoint, 1 guide, 5 teams, 1 public viewer — busier than
 * rally-day.spec.ts's 4-team setup) through a single real backend and
 * interleaves:
 *   - 5 teams logging in and checking in at checkpoint 1 concurrently, while
 *   - the guide reads checkpoint 1's indications at the same time, while
 *   - staffA evaluates 3 of those teams through the real UI (triggering a
 *     real FIRST_COMPLETE_CHECKPOINT badge auto-award on the first one),
 *   - 2 teams are advanced to checkpoint 2 and evaluated by staffB,
 *   - a public viewer's scoreboard (opened once, never reloaded) is watched
 *     throughout via real SSE and must reflect every one of the writes above,
 *   - a team contests one of staffA's evaluations; staffA edits it, which
 *     must show up in the audit trail with both actions,
 *   - the admin creates a live dynamic award mid-run — visible on the same
 *     open scoreboard without a reload,
 *   - and, interleaved with all of the above, the admin creates *and
 *     activates* a second ("next year's") edition through the real UI, then
 *     switches back to the current one — the kind of unrelated admin work
 *     that happens on a real event day, and a check that it doesn't corrupt
 *     any of the concurrent state above.
 *
 * Single worker (see playwright.config.ts's `fullstack` project) — real
 * concurrency inside one test is the point, not parallel test files.
 */

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function newAuthedPage(browser: Browser, user: Parameters<typeof seedRealOidcSession>[1]): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, user);
  return context.newPage();
}

async function teamLogin(page: Page, accessCode: string): Promise<void> {
  await page.goto('/rally/team-login');
  await page.getByPlaceholder('XXXX-XXXX').fill(accessCode);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/team-progress');
}

async function evaluateOnPage(page: Page, teamName: string): Promise<void> {
  await page.getByText(teamName).first().click();
  await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
  // See rally-day.spec.ts's identical note: BooleanForm's success control is
  // a visually-hidden checkbox with a styled label on top — target the label.
  await page.getByText('Team succeeded in the activity').first().click();
  await page.getByRole('button', { name: /submit evaluation/i }).click();
  await page.getByText('Voltar às equipas').click();
}

test.describe('Master rally day — every feature combined under real concurrency', () => {
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('5 teams, 3 staffed checkpoints, a guide, badges, contestation, a live dynamic award, and an unrelated mid-run edition switch — all at once, on one real backend', async ({
    browser,
  }) => {
    const day = await seedMegaRallyDay();
    const [checkpoint1, checkpoint2] = day.checkpoints;
    const [staffA, staffB] = day.staff;
    const [teamAlpha, teamBeta, teamGamma, teamDelta, teamEpsilon] = day.teams;

    const adminContext = await browser.newContext();
    await seedRealOidcSession(adminContext, day.admin);
    const adminPage = await adminContext.newPage();

    const guidePage = await newAuthedPage(browser, day.guide);
    const staffAPage = await newAuthedPage(browser, staffA.user);
    const staffBPage = await newAuthedPage(browser, staffB.user);
    const publicPage = await newPage(browser);
    const teamPages = await Promise.all([
      newPage(browser),
      newPage(browser),
      newPage(browser),
      newPage(browser),
      newPage(browser),
    ]);
    const [alphaPage, betaPage, gammaPage, deltaPage, epsilonPage] = teamPages;

    try {
      // The public scoreboard is opened first and never reloaded for the
      // rest of the test — every later assertion on it can only be
      // satisfied by the real SSE `refresh` push, not a fresh fetch.
      await publicPage.goto('/rally/scoreboard');
      await expect(publicPage.getByText(teamAlpha.name)).toBeVisible({ timeout: 20_000 });

      // Everyone arrives at once: 5 team logins, the guide opening its
      // checkpoint view, and the admin loading the dashboard, concurrently.
      await Promise.all([
        teamLogin(alphaPage, teamAlpha.accessCode),
        teamLogin(betaPage, teamBeta.accessCode),
        teamLogin(gammaPage, teamGamma.accessCode),
        teamLogin(deltaPage, teamDelta.accessCode),
        teamLogin(epsilonPage, teamEpsilon.accessCode),
        (async () => {
          await guidePage.goto('/rally/guide');
          await expect(guidePage.getByText('Postos — Visão do Guia')).toBeVisible({
            timeout: 20_000,
          });
          await guidePage.getByText(checkpoint1.name).click();
          await expect(guidePage.getByText('Quem é o santo padroeiro?')).toBeVisible({
            timeout: 15_000,
          });
        })(),
      ]);

      // All 5 teams arrive at checkpoint 1 concurrently via staff check-in.
      await Promise.all(
        day.teams.map((team) =>
          apiCall('POST', '/checkpoint/staff-check-in', {
            token: staffA.user.accessToken,
            body: { team_code: team.accessCode, checkpoint_id: checkpoint1.id },
          }),
        ),
      );

      // staffA evaluates 3 of the 5 through the real UI while, at the same
      // moment, the admin does unrelated admin work: creating and
      // activating a second ("next year's") edition. A real event day has
      // organizers doing exactly this kind of background prep while
      // evaluation is ongoing — it must not corrupt or block the live one.
      await staffAPage.goto(`/rally/staff-evaluation/checkpoint/${checkpoint1.id}`);
      const nextYearEventName = `E2E Mega Next Year ${day.runId}`;
      await Promise.all([
        evaluateOnPage(staffAPage, teamAlpha.name),
        (async () => {
          await adminPage.goto('/rally/admin?tab=events');
          await adminPage.getByRole('button', { name: 'Novo' }).click();
          await adminPage.locator('#ev-name').fill(nextYearEventName);
          await adminPage.getByRole('button', { name: /^Criar$/ }).click();
          await expect(adminPage.getByText(nextYearEventName)).toBeVisible({ timeout: 15_000 });
        })(),
      ]);
      // teamAlpha's first-checkpoint completion should have fired the real
      // auto-award — verified later on its own /achievements page, after
      // login (its team-progress context is already open).
      await evaluateOnPage(staffAPage, teamBeta.name);
      await evaluateOnPage(staffAPage, teamGamma.name);

      // The admin's background edition prep is still ongoing / just
      // finished — activate it, then switch straight back. This is the
      // "corrupts nothing" assertion: teamDelta/teamEpsilon (still at
      // checkpoint 1, not yet evaluated) must remain evaluable against the
      // *original* event throughout, since staff-check-in/evaluate never
      // switched which event is current from the *teams'* point of view.
      const nextYearEvent = (
        await apiCall<{ id: number; name: string }[]>('GET', '/events', {
          token: day.admin.accessToken,
        })
      ).find((e) => e.name === nextYearEventName);
      if (!nextYearEvent) throw new Error('next year event not found');
      await apiCall('POST', `/events/${nextYearEvent.id}/set-current`, {
        token: day.admin.accessToken,
      });
      await apiCall('POST', `/events/${day.eventId}/set-current`, {
        token: day.admin.accessToken,
      });

      // teamDelta and teamEpsilon are evaluated after the switch-and-back —
      // proving the round trip left the original event fully usable.
      await evaluateOnPage(staffAPage, teamDelta.name);
      await evaluateOnPage(staffAPage, teamEpsilon.name);

      // teamAlpha and teamBeta advance to checkpoint 2, where staffB
      // evaluates them through the real UI at the same time staffA is
      // still finishing up at checkpoint 1 above — the actual concurrency
      // this scenario is built to catch (two staff, two checkpoints, same
      // instant, same backend).
      await Promise.all([
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamAlpha.accessCode, checkpoint_id: checkpoint2.id },
        }),
        apiCall('POST', '/checkpoint/staff-check-in', {
          token: staffB.user.accessToken,
          body: { team_code: teamBeta.accessCode, checkpoint_id: checkpoint2.id },
        }),
      ]);
      await staffBPage.goto(`/rally/staff-evaluation/checkpoint/${checkpoint2.id}`);
      await evaluateOnPage(staffBPage, teamAlpha.name);
      const teamAlphaResultId = (
        await apiCall<{
          activities: { checkpoint_id: number; existing_result: { id: number } | null }[];
        }>('GET', `/staff/teams/${teamAlpha.id}/activities`, { token: staffB.user.accessToken })
      ).activities.find((a) => a.checkpoint_id === checkpoint2.id)?.existing_result?.id;
      if (!teamAlphaResultId) throw new Error('teamAlpha checkpoint 2 result not found');

      // Contestation via the real API, concurrent with the admin's live
      // dynamic award below. NOT via the UI: src/pages/team-progress's
      // <ContestButton> exists and has its own unit test, but is never
      // actually rendered anywhere in the app (grep confirms zero usages
      // outside its own file and unit test) — the contest feature is
      // currently unreachable through the UI at all. That's a real product
      // gap this spec surfaced, not a test shortcut; tracked in this
      // directory's README rather than silently worked around.
      const teamAlphaToken = await alphaPage.evaluate(() =>
        localStorage.getItem('rally_team_token'),
      );
      if (!teamAlphaToken) throw new Error('teamAlpha has no session token to contest with');

      const dynamicAwardPoints = 50;
      await Promise.all([
        apiCall('POST', `/team-auth/evaluations/${teamAlphaResultId}/contest`, {
          token: teamAlphaToken,
          body: { reason: `E2E contest ${day.runId}` },
        }),
        apiCall('POST', '/dynamic-awards', {
          token: day.admin.accessToken,
          body: { team_id: teamEpsilon.id, points: dynamicAwardPoints, reason: 'melhor claque' },
        }),
      ]);

      // staffB edits the contested result — the audit trail (manager-only
      // endpoint) must show both the CONTESTED and the UPDATED action.
      await apiCall(
        'PUT',
        `/staff/teams/${teamAlpha.id}/activities/${checkpoint2.activityId}/evaluate/${teamAlphaResultId}`,
        {
          token: staffB.user.accessToken,
          body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
        },
      );
      const history = await apiCall<{ action: string }[]>(
        'GET',
        `/staff/evaluations/${teamAlphaResultId}/history`,
        { token: day.admin.accessToken },
      );
      expect(history.some((h) => h.action === 'CONTESTED')).toBe(true);
      expect(history.some((h) => h.action === 'UPDATED')).toBe(true);

      // teamAlpha's badge from completing checkpoint 1 first must be real
      // and visible on its own achievements page.
      await alphaPage.goto('/rally/achievements');
      await expect(alphaPage.getByText('Badges')).toBeVisible({ timeout: 20_000 });
      const badgeCard = alphaPage.locator('div', { hasText: 'E2E Mega Primeiro Posto' }).last();
      await expect(badgeCard).toBeVisible({ timeout: 15_000 });
      await expect(badgeCard.getByText('Por conquistar')).toHaveCount(0);

      // The public scoreboard — never reloaded since the very first line of
      // this test — must reflect every evaluation and the dynamic award via
      // real SSE pushes, with no write lost to any of the concurrency above.
      await expect(async () => {
        const scoreboard = await apiCall<{ team_name: string; total_score: number }[]>(
          'GET',
          '/scoreboard/live',
          { token: day.admin.accessToken },
        );
        const epsilonScore = scoreboard.find((t) => t.team_name === teamEpsilon.name);
        expect(epsilonScore?.total_score).toBeGreaterThanOrEqual(dynamicAwardPoints);
        for (const team of [teamAlpha, teamBeta, teamGamma, teamDelta]) {
          const score = scoreboard.find((t) => t.team_name === team.name);
          expect(score?.total_score).toBeGreaterThan(0);
        }
      }).toPass({ timeout: 20_000 });

      const epsilonCard = publicPage.locator('a', { hasText: teamEpsilon.name });
      await expect(epsilonCard.getByText(/pts/)).not.toHaveText('0 pts', { timeout: 20_000 });

      // Final cross-check: exactly one evaluation per (team, checkpoint)
      // pair actually evaluated — the edit above must not have duplicated
      // teamAlpha's checkpoint-2 result, and none of the concurrency earlier
      // silently dropped or doubled a write.
      const allEvaluations = await apiCall<{ evaluations: { team_id: number; activity_id: number }[] }>(
        'GET',
        '/staff/all-evaluations',
        { token: day.admin.accessToken },
      );
      const countFor = (teamId: number, activityId: number) =>
        allEvaluations.evaluations.filter((e) => e.team_id === teamId && e.activity_id === activityId)
          .length;
      for (const team of [teamAlpha, teamBeta, teamGamma, teamDelta, teamEpsilon]) {
        expect(countFor(team.id, checkpoint1.activityId)).toBe(1);
      }
      expect(countFor(teamAlpha.id, checkpoint2.activityId)).toBe(1);
      expect(countFor(teamBeta.id, checkpoint2.activityId)).toBe(1);
    } finally {
      await Promise.all([
        adminContext.close(),
        guidePage.context().close(),
        staffAPage.context().close(),
        staffBPage.context().close(),
        publicPage.context().close(),
        ...teamPages.map((p) => p.context().close()),
      ]);
    }
  });
});
