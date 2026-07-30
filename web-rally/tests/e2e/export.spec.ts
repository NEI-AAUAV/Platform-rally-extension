import { test, expect } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';
import { seedOidcSession, MANAGER_GROUPS } from './helpers/session';

const MOCK_EVENT = {
  id: 1,
  name: 'Rally 2026',
  slug: 'rally-2026',
  description: '',
  event_type: 'rally_tascas',
  config: {},
  is_active: true,
  is_current: true,
  start_time: null,
  end_time: null,
  rotation_schedule: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// A tiny non-empty body stands in for the xlsx binary; the test only checks
// that the click reaches the endpoint and starts a download.
const FAKE_XLSX = 'UEsDBBQABrowser-placeholder';

test.describe('Admin results export', () => {
  test.beforeEach(async ({ page, context }) => {
    await seedOidcSession(context, MANAGER_GROUPS);

    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
      });
    });

    await page.route('**/api/rally/v1/events**', async (route) => {
      // Only the list GET (no trailing path) returns the events array; the
      // export sub-route is handled by its own more specific mock below.
      if (route.request().url().includes('/export')) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_EVENT]),
      });
    });

    await page.goto('/rally/admin?tab=events', { waitUntil: 'networkidle' });
  });

  test('exports an event via the download button', async ({ page }) => {
    let exportRequested = false;
    await page.route('**/api/rally/v1/events/1/export', async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: {
          'content-disposition': 'attachment; filename="Rally_2026_results.xlsx"',
        },
        body: FAKE_XLSX,
      });
    });

    const exportButton = page.getByRole('button', { name: /Exportar resultados/i });
    await expect(exportButton).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;

    expect(exportRequested).toBe(true);
    expect(download.suggestedFilename()).toBe('Rally_2026_resultados.xlsx');
  });
});
