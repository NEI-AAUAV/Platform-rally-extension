import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  MOCK_RALLY_SETTINGS,
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_ACTIVITY_LIST,
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_JWT_TOKEN_STAFF,
} from '../mocks/data';
import { seedOidcSession, MANAGER_GROUPS, STAFF_GROUPS } from './helpers/session';

/**
 * Accessibility gate: fails on serious/critical WCAG 2 A/AA violations.
 * "Moderate" and "minor" are excluded from failure to keep this actionable
 * rather than noisy — tighten once the surfaces are clean at this bar.
 */
/**
 * Block until entrance animations have settled.
 *
 * axe scores the colours actually painted, and mid-fade an element's computed
 * colour is a blend of itself and whatever is behind it. The home hero's
 * countdown labels measure #818792 on #fefefe (3.5:1, failing) while an
 * ancestor is still at opacity 0.5, and #4b5363 on #ffffff (7.1:1, passing)
 * once it reaches 1 — so without this the gate reports contrast failures
 * against colours no user is ever shown.
 *
 * `reducedMotion: 'reduce'` is not enough on its own: framer-motion's
 * equivalent setting deliberately keeps opacity animations (only transform and
 * layout animations are suppressed, since those are the vestibular triggers).
 * So sample the opacity of every element until two consecutive readings match.
 */
const ENTRANCE_SETTLE_MS = 1_500;

async function waitForVisualStability(page: Page): Promise<void> {
  // A fixed wait rather than polling for stability: several surfaces animate
  // continuously (the scoreboard marquee, the home countdown ticking each
  // second), so "nothing changed between two samples" never becomes true there.
  // The longest entrance is a 0.5s delay plus a 0.55s fade, so 1.5s clears it.
  // NOSONAR: no observable condition exists to sync on (see comment above).
  await page.waitForTimeout(ENTRANCE_SETTLE_MS); // NOSONAR
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  await waitForVisualStability(page);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  const summary = serious
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.nodes[0]?.target.join(' ') ?? ''}`,
    )
    .join('\n');

  expect(serious, summary).toEqual([]);
}

/**
 * Routes that need nothing but the public settings call. Table-driven rather
 * than five near-identical tests, so adding a route to the gate is one line.
 */
const PUBLIC_ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: 'home', path: '/rally/' },
  { name: 'rules', path: '/rally/rules' },
  { name: 'checkpoints', path: '/rally/checkpoints' },
];

test.describe('Accessibility', () => {
  // Sample colours in the settled state. Mid-fade, an element's computed
  // colour is a blend of itself and whatever is behind it, and axe scores the
  // blend — the home hero's countdown labels measure #838994 on #fefefe
  // (3.43:1, failing) while still animating in, against #4b5363 on #ffffff
  // (7.1:1, passing) once settled. The app already disables its entrance
  // animations under prefers-reduced-motion, so asking for it here removes the
  // transient without adding a sleep, and exercises the reduced-motion path.
  test.use({ reducedMotion: 'reduce' });

  for (const { name, path } of PUBLIC_ROUTES) {
    test(`${name} has no serious a11y violations`, async ({ page }) => {
      await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
        }),
      );
      await page.route('**/api/rally/v1/checkpoint/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([MOCK_CHECKPOINT]),
        }),
      );

      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page
        .waitForResponse('**/api/rally/v1/rally/settings/public**', { timeout: 10000 })
        .catch(() => {});
      await expect(page.locator('body')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }

  test('team login page has no serious a11y violations', async ({ page }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RALLY_SETTINGS),
      }),
    );

    await page.goto('/rally/team-login', { waitUntil: 'networkidle' });
    await expectNoSeriousViolations(page);
  });

  test('scoreboard has no serious a11y violations', async ({ page }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
      }),
    );
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_TEAM]),
      }),
    );

    await page.goto('/rally/scoreboard', { waitUntil: 'networkidle' });
    await expectNoSeriousViolations(page);
  });

  test('settings page has no serious a11y violations', async ({ page, context }) => {
    await page.route('**/api/nei/v1/auth/refresh/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: MOCK_JWT_TOKEN_MANAGER }),
      }),
    );
    await page.route('**/api/nei/v1/user/me**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test Manager',
          scopes: ['manager-rally', 'rally-staff'],
        }),
      }),
    );
    await page.route('**/api/rally/v1/rally/settings**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RALLY_SETTINGS),
      }),
    );

    await seedOidcSession(context, MANAGER_GROUPS);
    await page.goto('/rally/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 10000 }).catch(() => {});
    await page.waitForResponse('**/api/rally/v1/rally/settings**', { timeout: 10000 }).catch(() => {});
    await expect(
      page.getByRole('heading', { name: 'Configurações', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expectNoSeriousViolations(page);
  });

  test('admin panel has no serious a11y violations', async ({ page, context }) => {
    await seedOidcSession(context, MANAGER_GROUPS);
    await page.route('**/api/rally/v1/rally/settings**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
      }),
    );
    await page.route('**/api/rally/v1/checkpoint/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_CHECKPOINT]),
      }),
    );
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_TEAM]),
      }),
    );
    await page.route('**/api/rally/v1/activities/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      }),
    );

    await page.goto('/rally/admin', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({
      timeout: 10000,
    });
    await expectNoSeriousViolations(page);
  });

  test('staff evaluation checkpoint has no serious a11y violations', async ({
    page,
    context,
  }) => {
    await page.route('**/api/nei/v1/auth/refresh/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: MOCK_JWT_TOKEN_STAFF }),
      }),
    );
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RALLY_SETTINGS),
      }),
    );
    await page.route('**/api/rally/v1/checkpoint/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_CHECKPOINT]),
      }),
    );
    await page.route('**/api/rally/v1/team/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_TEAM]),
      }),
    );
    await page.route('**/api/rally/v1/activities/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      }),
    );
    await page.route('**/api/rally/v1/staff/my-checkpoint**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CHECKPOINT),
      }),
    );

    await seedOidcSession(context, STAFF_GROUPS);
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'networkidle',
    });
    await expectNoSeriousViolations(page);
  });
});
