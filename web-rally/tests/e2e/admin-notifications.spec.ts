import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

async function gotoNotifications(page: Page) {
  await page.goto('/rally/admin?tab=notifications');
}

test.describe('Admin notifications (broadcast)', () => {
  test('sends a broadcast and shows the delivered count', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/push/broadcast', (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: 3 }) });
    });

    await gotoNotifications(page);
    await page.getByPlaceholder('Ex: Atenção equipas!').fill('Chuva a chegar');
    await page.getByPlaceholder('Ex: Vai começar a chover, procurem abrigo no posto mais próximo.').fill('Abriguem-se no posto mais próximo.');
    await page.getByRole('button', { name: 'Enviar a todas as equipas' }).click();

    await expect.poll(() => capturedBody).toEqual({
      title: 'Chuva a chegar',
      body: 'Abriguem-se no posto mais próximo.',
      url: null,
    });
    await expect(page.getByText('Enviado a 3 dispositivo(s).')).toBeVisible();
  });

  test('shows an error when VAPID is not configured', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route('**/api/rally/v1/push/broadcast', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Push not configured' }) }),
    );

    await gotoNotifications(page);
    await page.getByPlaceholder('Ex: Atenção equipas!').fill('Título');
    await page.getByPlaceholder('Ex: Vai começar a chover, procurem abrigo no posto mais próximo.').fill('Mensagem');
    await page.getByRole('button', { name: 'Enviar a todas as equipas' }).click();

    await expect(page.getByText('Push not configured')).toBeVisible();
  });
});
