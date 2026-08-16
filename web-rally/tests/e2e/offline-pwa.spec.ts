import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, STAFF_GROUPS } from './helpers/session';
import { MOCK_CHECKPOINT, MOCK_TEAM, MOCK_RALLY_SETTINGS, MOCK_BOOLEAN_ACTIVITY } from '../mocks/data';

/**
 * PWA / offline-evaluation-queue suite (Parte 6). Staff evaluate on phones
 * over flaky venue wifi; src/offline/evalQueue.ts durably queues submits in
 * IndexedDB when the network is down and src/offline/useOfflineSync.ts
 * drains them on reconnect. This exercises the real queue/drain code (no
 * mocking of evalQueue itself) against a route-mocked evaluate endpoint.
 */

function evaluateResponse(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

async function setupEvaluationPage(page: Page) {
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
}

test.describe('PWA / offline evaluation queue', () => {
  test('a web app manifest is served for installability, and the service worker script is reachable', async ({
    page,
  }) => {
    // Playwright deliberately blocks real Service Worker *registration* in the
    // browser context it drives, so registration itself can't be asserted
    // here — that's covered by the vite-plugin-pwa build (dist/sw.js is
    // generated from src/sw.ts, verified by `pnpm build`). What e2e *can*
    // verify: the manifest is linked and loads, and the SW script the
    // manifest/registerSW() call depends on is actually served at runtime.
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );
    await page.goto('/rally/');

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestResponse = await page.request.get(new URL(manifestHref!, page.url()).toString());
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons?.length).toBeGreaterThan(0);

    const swResponse = await page.request.get(new URL('/rally/sw.js', page.url()).toString());
    expect(swResponse.ok()).toBe(true);
  });

  // These three run on `mobile` as well as `chromium`. They used to carry a
  // "Desktop-only: not a visual/layout test" skip copied from the specs where
  // that reason genuinely applies — but offline evaluation is a phone feature
  // first: staff evaluate in a field with no signal, so the mobile project is
  // the one that matters most here.
  test('evaluating while offline queues the submit in IndexedDB instead of failing the UI', async ({
    page,
    context,
  }) => {
    await seedOidcSession(context, STAFF_GROUPS);
    await setupEvaluationPage(page);
    // Simulate the device going offline: route the evaluate call to fail
    // like a dropped connection (route.abort mirrors a real network error
    // better than context.setOffline, which also blocks the app shell/API
    // reads the page already needs to have rendered). Registered before
    // navigation so it's in place before the form's submit fires.
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', (route) =>
      route.abort('internetdisconnected'),
    );
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.getByText(MOCK_TEAM.name).first().click();
    await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
    await page.getByRole('button', { name: /submeter avalia|submit evaluation/i }).click();

    // Queue banner appears once the app-side queue has a pending entry.
    await expect(page.getByRole('status').filter({ hasText: /por sincronizar/i })).toBeVisible({ timeout: 10_000 });

    // Read the raw IndexedDB store idb-keyval backs (rally-offline/eval-queue,
    // key "queue") directly — page.evaluate can't resolve a bare `idb-keyval`
    // module specifier since nothing bundles it into the page context.
    const queued = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const openReq = indexedDB.open('rally-offline');
          openReq.onerror = () => reject(openReq.error);
          openReq.onsuccess = () => {
            const tx = openReq.result.transaction('eval-queue', 'readonly');
            const getReq = tx.objectStore('eval-queue').get('queue');
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => reject(getReq.error);
          };
        }),
    );
    expect(Array.isArray(queued)).toBe(true);
    expect((queued as unknown[]).length).toBeGreaterThan(0);
  });

  test('reconnecting drains the queue and clears the pending banner', async ({ page, context }) => {
    await seedOidcSession(context, STAFF_GROUPS);
    await setupEvaluationPage(page);

    let evaluateCallCount = 0;
    let failNext = true;
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      if (failNext) {
        failNext = false;
        return route.abort('internetdisconnected');
      }
      evaluateCallCount += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evaluateResponse()) });
    });
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.getByText(MOCK_TEAM.name).first().click();
    await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
    await page.getByRole('button', { name: /submeter avalia|submit evaluation/i }).click();

    await expect(page.getByRole('status').filter({ hasText: /por sincronizar/i })).toBeVisible({ timeout: 10_000 });

    // Reconnect: fire the browser 'online' event the app listens for, which
    // triggers useOfflineSync's drain against the now-succeeding mock.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect.poll(() => evaluateCallCount, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('status').filter({ hasText: /por sincronizar/i })).toHaveCount(0, { timeout: 10_000 });
  });

  test('a permanently-failed replay is shown as failed, not silently dropped', async ({ page, context }) => {
    await seedOidcSession(context, STAFF_GROUPS);
    await setupEvaluationPage(page);
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', (route) =>
      route.abort('internetdisconnected'),
    );
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.getByText(MOCK_TEAM.name).first().click();
    await page.getByRole('button', { name: /avaliar|evaluate/i }).first().click();
    await page.getByRole('button', { name: /submeter avalia|submit evaluation/i }).click();

    await expect(page.getByRole('status').filter({ hasText: /por sincronizar/i })).toBeVisible({ timeout: 10_000 });

    // Drain retried on 'online' but the endpoint still fails — entry moves to
    // "failed", not silently discarded, and the manual "Sincronizar" retry
    // affordance stays available.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(page.getByRole('status').filter({ hasText: /com falha/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Sincronizar/i })).toBeVisible();
  });
});
