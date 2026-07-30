import { test, expect } from '@playwright/test';
import { mintToken, seedRealOidcSession, apiCall } from './helpers/fullstackAuth';
import { seedRally, waitForApi } from './helpers/seedRally';

/**
 * Full-stack golden path: real api-rally (docker-compose.smoke.yml) behind
 * the fullstack Playwright project's proxy, no route mocking. Mirrors
 * api-rally/scripts/smoke/run_smoke.py's contract but drives the actual
 * built web app instead of calling the API directly, so it also catches
 * frontend/backend contract drift the Python smoke script can't see.
 *
 * Requires: docker compose -f api-rally/docker-compose.smoke.yml up -d
 * postgres redis fake-oidc api (see tests/e2e-fullstack/README.md).
 */
test.describe('Full-stack golden path', () => {
  test.beforeAll(async () => {
    await waitForApi();
  });

  test('team logs in with a real access code, is checked in by staff, staff evaluates, scoreboard updates', async ({
    page,
  }) => {
    const rally = await seedRally();

    // Team logs in with the real access code the API generated.
    await page.goto('/rally/team-login');
    await page.getByPlaceholder('XXXX-XXXX').fill(rally.accessCode);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/team-progress');

    // Staff checks the team in at the checkpoint via the real
    // staff-check-in endpoint (access-code based, not GPS geofencing —
    // GPS arrival is a peddy_paper-only flow, not exercised here).
    await apiCall('POST', '/checkpoint/staff-check-in', {
      token: rally.admin.accessToken,
      body: { team_code: rally.accessCode, checkpoint_id: rally.checkpointId },
    });

    // Staff evaluates the boolean activity — real scoring service computes points.
    await apiCall('POST', `/staff/teams/${rally.teamId}/activities/${rally.activityId}/evaluate`, {
      token: rally.admin.accessToken,
      body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
    });

    // Team's own progress view reflects the real, server-computed state.
    await page.reload();
    await expect(page.getByText('Concluído').first()).toBeVisible({ timeout: 15_000 });

    // Public scoreboard (real backend, no mock) lists the team.
    await page.goto('/rally/scoreboard');
    await expect(page.getByText(`E2E Team ${rally.checkpointOrder}`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('admin panel loads real checkpoint and activity data end-to-end', async ({ page, context }) => {
    const rally = await seedRally();
    const admin = await mintToken({
      sub: `e2e-admin2-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name: 'E2E Admin Two',
      groups: ['admin'],
    });
    // A fresh sub has no mirrored local user row until an authenticated API
    // call materializes it (see seedRally.ts's comment on the same lazy
    // creation) — without one, GET /checkpoint/'s get_current_user_optional
    // resolves to None and the endpoint silently falls back to the public
    // "focused" route view, which truncates to a single checkpoint
    // regardless of how many actually exist.
    await apiCall('GET', '/rally/settings', { token: admin.accessToken });
    await seedRealOidcSession(context, admin);

    await page.goto(`/rally/admin?tab=checkpoints`);

    await expect(page.getByText('Checkpoints Existentes')).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(`E2E Checkpoint ${rally.checkpointOrder}`)).toBeAttached({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  });

  test('invalid access code is rejected by the real backend', async ({ page }) => {
    await page.goto('/rally/team-login');
    await page.getByPlaceholder('XXXX-XXXX').fill('ZZZZ-9999');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText(/inválido|invalid|not found/i).first()).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/team-login');
  });
});
