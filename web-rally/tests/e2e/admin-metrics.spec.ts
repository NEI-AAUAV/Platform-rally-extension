import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
    }),
  );
}

// Aggregated server-side; the panel no longer parses the Prometheus text format.
const MOCK_METRICS = {
  requests_total: 123,
  errors_5xx: 3,
  rate_limit_rejections: 2,
  request_duration_seconds_sum: 24.5,
  request_duration_seconds_count: 120,
};

const MOCK_READINESS = {
  status: 'ok',
  db: 'up',
  redis: 'up',
  workers: [{ name: 'scoring-worker', alive: true, last_beat: 1 }],
};

const METRICS_URL = '**/api/rally/v1/admin/metrics';
const READY_URL = '**/api/rally/v1/health/ready';

async function mockMetrics(page: Page) {
  await page.route(METRICS_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_METRICS),
    }),
  );
  await page.route(READY_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_READINESS) }),
  );
}

async function gotoMetrics(page: Page) {
  await page.goto('/rally/admin?tab=metrics');
}

test.describe('Admin metrics', () => {
  test('loads health status and request stats', async ({ page, context }) => {
    await mockSettings(page);
    await mockMetrics(page);
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoMetrics(page);

    await expect(page.getByText('Base de dados')).toBeVisible();
    await expect(page.getByText('Workers vivos')).toBeVisible();
    await expect(page.getByText('123', { exact: false })).toBeVisible();
  });

  test('shows an error banner when metrics or readiness fail to load', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await page.route(METRICS_URL, (route) => route.fulfill({ status: 500, body: '' }));
    await page.route(READY_URL, (route) => route.fulfill({ status: 503, body: '{}' }));
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoMetrics(page);

    await expect(
      page.getByText('Não foi possível obter métricas ou estado de saúde do servidor.'),
    ).toBeVisible();
  });

  test('marks db as down when readiness reports an unhealthy dependency', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await page.route(METRICS_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_METRICS),
      }),
    );
    await page.route(READY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_READINESS, db: 'down' }),
      }),
    );
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoMetrics(page);

    await expect(page.getByText('Em baixo').first()).toBeVisible();
  });
});
