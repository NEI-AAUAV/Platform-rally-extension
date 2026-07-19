import { test, expect } from '@playwright/test';
import { seedOidcSession } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

test.describe('Auth callback', () => {
  test('redirects to stored return URL when already authenticated', async ({ page, context }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );
    await seedOidcSession(context, ['rally-participant']);
    await page.addInitScript(() => {
      sessionStorage.setItem('rally_auth_return_url', '/profile');
    });

    await page.goto('/rally/auth/callback');

    await page.waitForURL('**/profile');
    const returnUrl = await page.evaluate(() => sessionStorage.getItem('rally_auth_return_url'));
    expect(returnUrl).toBeNull();
  });

  test('redirects home when already authenticated with no stored return URL', async ({
    page,
    context,
  }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );
    await seedOidcSession(context, ['rally-participant']);

    await page.goto('/rally/auth/callback');

    await page.waitForURL('**/rally/');
  });

  test('shows a loading spinner before auth resolves', async ({ page }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
    );

    await page.goto('/rally/auth/callback');

    await expect(page.getByText(/A concluir sessão…|Erro de autenticação/)).toBeVisible();
  });
});
