import { test, expect } from '@playwright/test';
import { seedRealOidcSession } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';
import { seedGuideAndBadgesScenario } from './helpers/seedGuideAndBadges';

/**
 * Gap this spec closes: guide mode and auto-awarded badges exist only as
 * mocked reimplementations (tests/e2e/guide.spec.ts,
 * tests/e2e/conquistas.spec.ts) — never exercised against a real backend, so
 * a drift between the mock and the real API contract (e.g. the guide
 * indication payload shape, or the badge trigger evaluator) would pass every
 * existing fullstack test.
 *
 * Three real actors concurrently: a guide viewing their checkpoint's
 * indications, a staff member evaluating a team's activity at that same
 * checkpoint through the real UI, and the team itself. The evaluation
 * triggers a real FIRST_COMPLETE_CHECKPOINT badge award server-side; the
 * team must see it on its own real /rally/conquistas page afterwards.
 */

test.describe('Guide mode and auto-awarded badges against a real backend', () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('guide sees indications while staff evaluates concurrently; the team is awarded a badge for real', async ({
    browser,
  }) => {
    const scenario = await seedGuideAndBadgesScenario();

    const guideContext = await browser.newContext();
    await seedRealOidcSession(guideContext, scenario.guide);
    const guidePage = await guideContext.newPage();

    const staffContext = await browser.newContext();
    await seedRealOidcSession(staffContext, scenario.staff);
    const staffPage = await staffContext.newPage();

    const teamContext = await browser.newContext();
    const teamPage = await teamContext.newPage();

    try {
      // Guide and staff act at the same time: the guide reads the
      // checkpoint's indications (never the expected_answer publicly — that
      // boundary is exercised in the mocked security-abac.spec.ts; here we
      // confirm the *authenticated* guide path actually returns them for
      // real) while staff independently evaluates the team's activity.
      await Promise.all([
        (async () => {
          await guidePage.goto('/rally/guide');
          await expect(guidePage.getByText('Postos — Visão do Guia')).toBeVisible({
            timeout: 20_000,
          });
          await expect(guidePage.getByText(scenario.checkpointName)).toBeVisible();
          await guidePage.getByText(scenario.checkpointName).click();
          await expect(guidePage.getByText('Quem é o santo padroeiro?')).toBeVisible({
            timeout: 15_000,
          });
        })(),
        (async () => {
          await teamPage.goto('/rally/team-login');
          await teamPage.getByPlaceholder('XXXX-XXXX').fill(scenario.accessCode);
          await teamPage.getByRole('button', { name: 'Entrar', exact: true }).click();
          await teamPage.waitForURL('**/team-progress');
        })(),
      ]);

      await staffPage.goto(`/rally/staff-evaluation/checkpoint/${scenario.checkpointId}`);
      await staffPage.getByText(scenario.teamName).first().click();
      await staffPage.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
      await staffPage.getByText('Team succeeded in the activity').first().click();
      await staffPage.getByRole('button', { name: /submit evaluation/i }).click();

      // The auto-award runs synchronously with the evaluation on the real
      // backend — the team's own conquistas page (real navigation, real
      // team JWT) should now show the badge as earned, not locked.
      await teamPage.goto('/rally/conquistas');
      await expect(teamPage.getByText('Badges')).toBeVisible({ timeout: 20_000 });
      const badgeCard = teamPage.locator('div', { hasText: `E2E Primeiro Posto` }).last();
      await expect(badgeCard).toBeVisible({ timeout: 15_000 });
      await expect(badgeCard.getByText('Por conquistar')).toHaveCount(0);
    } finally {
      await Promise.all([guideContext.close(), staffContext.close(), teamContext.close()]);
    }
  });
});
