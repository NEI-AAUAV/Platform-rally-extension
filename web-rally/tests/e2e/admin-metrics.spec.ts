import { test, expect, type Page } from '@playwright/test';
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

const MOCK_METRICS_TEXT = [
  'rally_http_requests_total{status="200"} 120',
  'rally_http_requests_total{status="500"} 3',
  'rally_http_request_duration_seconds_sum 24.5',
  'rally_http_request_duration_seconds_count 120',
  'rally_rate_limit_rejections_total 2',
].join('\n');

const MOCK_READINESS = {
  status: 'ok',
  db: 'up',
  redis: 'up',
  workers: [{ name: 'scoring-worker', alive: true, last_beat: 1 }],
};

async function mockMetrics(page: Page) {
  await page.route('**/metrics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: MOCK_METRICS_TEXT }),
  );
  await page.route('**/health/ready', (route) =>
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
    await page.route('**/metrics', (route) => route.fulfill({ status: 500, body: '' }));
    await page.route('**/health/ready', (route) => route.fulfill({ status: 503, body: '{}' }));
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
    await page.route('**/metrics', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: MOCK_METRICS_TEXT }),
    );
    await page.route('**/health/ready', (route) =>
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
