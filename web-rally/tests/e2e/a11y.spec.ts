import { test, expect, type Page } from '@playwright/test';
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
async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  const summary = serious
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.helpNodes?.[0]?.target ?? ''}`,
    )
    .join('\n');

  expect(serious, summary).toEqual([]);
}

test.describe('Accessibility', () => {
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
    await page.goto('/rally/settings', { waitUntil: 'networkidle' });
    await page.waitForResponse('**/api/nei/v1/user/me**').catch(() => {});
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
