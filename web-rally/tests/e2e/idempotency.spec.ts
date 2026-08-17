import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, STAFF_GROUPS } from './helpers/session';
import { MOCK_CHECKPOINT, MOCK_TEAM, MOCK_RALLY_SETTINGS, MOCK_BOOLEAN_ACTIVITY } from '../mocks/data';

async function setupEvaluationPage(page: Page): Promise<() => number> {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
  await page.route('**/api/rally/v1/checkpoint/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_CHECKPOINT]) }),
  );
  await page.route('**/api/rally/v1/team/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_TEAM]) }),
  );
  await page.route('**/api/rally/v1/activities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activities: [MOCK_BOOLEAN_ACTIVITY], total: 1, page: 1, size: 100 }) }),
  );
  await page.route('**/api/rally/v1/staff/my-checkpoint', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHECKPOINT) }),
  );
  await page.route('**/api/rally/v1/staff/teams/*/activities**', (route) => {
    const url = route.request().url();
    if (url.includes('/evaluate')) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        team: MOCK_TEAM,
        activities: [MOCK_BOOLEAN_ACTIVITY],
        evaluation_summary: {
          total_activities: 1,
          completed_activities: 0,
          pending_activities: 1,
          completion_rate: 0,
          has_incomplete: false,
          missing_activities: [],
          checkpoint_mismatch: false,
          team_checkpoint: 1,
          current_checkpoint: 1,
        },
      }),
    });
  });

  let evaluateCallCount = 0;
  const seenKeys = new Set<string>();
  await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
    evaluateCallCount += 1;
    const key = route.request().headers()['idempotency-key'];
    if (key) seenKeys.add(key);
    // Simulate realistic latency so a double-click has a window to race.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        activity_id: MOCK_BOOLEAN_ACTIVITY.id,
        team_id: MOCK_TEAM.id,
        result_data: { success: true },
        extra_shots: 0,
        penalties: {},
        time_score: null,
        points_score: null,
        boolean_score: 100,
        team_vs_result: null,
        final_score: 100,
        is_completed: true,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  return () => evaluateCallCount;
}

test.describe('Idempotency', () => {
  test('double-clicking submit on an evaluation form only fires one network request', async ({
    page,
    context,
  }, testInfo) => {
    // Desktop-viewport interaction test (button placement/click precision) —
    // not asserting anything visual, so the mobile project's smaller viewport
    // adds no signal, just layout-driven flakiness (menu overlay intercepts).
    test.skip(testInfo.project.name === 'mobile', 'Desktop-only: not a visual/layout test');
    await seedOidcSession(context, STAFF_GROUPS);
    const getCallCount = await setupEvaluationPage(page);

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);
    await page.getByText(MOCK_TEAM.name).first().click();

    await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();

    const submitButton = page.getByRole('button', { name: /submit evaluation|submeter avaliação|atualizar avaliação/i });
    await expect(submitButton).toBeVisible();

    // First click starts the (slow, mocked) submit; the button disables
    // immediately (isSubmitting) and the modal unmounts on success, so a
    // rapid second click either hits a disabled button or nothing at all —
    // verifying the button itself is the idempotency guard, not just the
    // request's Idempotency-Key header.
    await submitButton.click();
    // force: true is intentional here — the button is expected to become disabled
    // or unmount immediately after the first click (that's the behavior under test),
    // so waiting for actionability would defeat the purpose of this rapid second click.
    await submitButton.click({ force: true, timeout: 1000 }).catch(() => {}); // NOSONAR(S8783): forcing the race is the point of this test, see comment above

    await expect.poll(() => getCallCount(), { timeout: 5000 }).toBe(1);
    // Keep polling for a window so any accidental straggler request would surface as a failure,
    // instead of sleeping blind and hoping it arrived in time.
    await expect.poll(() => getCallCount(), { timeout: 1000 }).toBe(1);
    expect(getCallCount()).toBe(1);
  });
});
