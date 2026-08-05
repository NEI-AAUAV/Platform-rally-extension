import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

async function mockPending(page: Page, results: unknown[]) {
  await page.route('**/api/rally/v1/activities/deferred/pending', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) }),
  );
}

async function gotoJudging(page: Page) {
  await page.goto('/rally/admin?tab=judging');
}

const PENDING = [
  { id: 1, team_id: 3, activity_id: 5, media_urls: ['https://example.com/photo.jpg'] },
];

test.describe('Admin judging', () => {
  test('shows empty state when there is nothing pending', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, []);

    await gotoJudging(page);

    await expect(page.getByText('Sem julgamentos pendentes')).toBeVisible();
  });

  test('lists pending results with team/activity ids and photo thumbnails', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);

    await gotoJudging(page);

    await expect(page.getByText('Equipa #3 — Atividade #5')).toBeVisible();
    await expect(page.getByAltText('Foto 1')).toBeVisible();
  });

  test('result without photos shows the no-photos fallback', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, [{ id: 2, team_id: 4, activity_id: 6, media_urls: [] }]);

    await gotoJudging(page);

    await expect(page.getByText('Sem fotos anexadas')).toBeVisible();
  });

  test('judging a result submits points and notes, then removes it from the pending list', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    let judgeCallCount = 0;
    await page.route('**/api/rally/v1/activities/deferred/pending', (route) => {
      judgeCallCount += 1;
      const body = judgeCallCount === 1 ? PENDING : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/activities/results/1/judge', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, points: 80 }) });
    });

    await gotoJudging(page);
    await page.getByRole('button', { name: 'Julgar' }).click();
    await page.getByPlaceholder('0–100').fill('80');
    await page.getByPlaceholder('Observações…').fill('Boa participação');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect.poll(() => capturedBody).toEqual({ points: 80, notes: 'Boa participação' });
    await expect(page.getByText('Sem julgamentos pendentes')).toBeVisible();
  });

  test('confirm button is disabled until points are entered', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);

    await gotoJudging(page);
    await page.getByRole('button', { name: 'Julgar' }).click();

    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  test('canceling the judging form discards the input', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);

    await gotoJudging(page);
    await page.getByRole('button', { name: 'Julgar' }).click();
    await page.getByPlaceholder('0–100').fill('50');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('button', { name: 'Julgar' })).toBeVisible();
  });

  test('shows an error message when judging fails', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);
    await page.route('**/api/rally/v1/activities/results/1/judge', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server error' }) }),
    );

    await gotoJudging(page);
    await page.getByRole('button', { name: 'Julgar' }).click();
    await page.getByPlaceholder('0–100').fill('80');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByText('Erro ao submeter julgamento. Tenta novamente.')).toBeVisible();
  });
});
