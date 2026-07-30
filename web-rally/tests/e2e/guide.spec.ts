import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  MOCK_RALLY_SETTINGS,
  MOCK_JWT_TOKEN_GUIDE,
  MOCK_JWT_TOKEN_STAFF,
} from '../mocks/data';

const GUIDE_SETTINGS = {
  ...MOCK_RALLY_SETTINGS,
  guide_mode_enabled: true,
  guide_mode_active: true,
};

const GUIDE_CHECKPOINTS = [
  {
    id: 1,
    name: 'Posto da Sé',
    order: 1,
    description: 'Catedral histórica',
    latitude: 40.6306,
    longitude: -8.6591,
    media: [
      {
        id: 11,
        kind: 'photo',
        url: 'https://cdn.example/foto.jpg',
        caption: 'Fachada',
        display_order: 0,
      },
      {
        id: 12,
        kind: 'fun_fact',
        url: null,
        caption: 'Construída no séc. XV',
        display_order: 1,
      },
    ],
    indications: [
      {
        id: 21,
        hint: 'Aponta para a estátua e pergunta o nome',
        question: 'Quem é o santo padroeiro?',
        expected_answer: 'São Domingos',
        order: 0,
      },
    ],
  },
  {
    id: 2,
    name: 'Posto do Mercado',
    order: 2,
    description: null,
    latitude: null,
    longitude: null,
    media: [],
    indications: [],
  },
];

async function seedSession(
  context: BrowserContext,
  token: string,
  groups: string[] = ['rally-guide'],
) {
  // react-oidc-context restores the session from oidc-client-ts's storage key
  // `oidc.user:<authority>:<client_id>` (both empty in the test build).
  await context.addInitScript(
    ([t, gs]) => {
      const user = {
        access_token: t,
        token_type: 'Bearer',
        profile: {
          sub: 'e2e-user-1',
          name: 'E2E User',
          email: 'e2e@ua.pt',
          groups: gs,
          iss: '',
          aud: '',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: 'openid profile email',
      };
      localStorage.setItem('oidc.user::', JSON.stringify(user));
    },
    [token, groups] as [string, string[]],
  );
}

async function mockCommonRoutes(page: Page, token: string) {
  await page.route('**/api/nei/v1/auth/refresh/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token }),
    }),
  );
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(GUIDE_SETTINGS),
    }),
  );
  await page.route('**/api/rally/v1/user/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 789,
        name: 'Guide User',
        disabled: false,
        team_id: null,
        is_captain: false,
        scopes: ['rally-guide'],
      }),
    }),
  );
}

test.describe('Guide page', () => {
  test('guide sees checkpoints with indications and media', async ({ page, context }) => {
    await seedSession(context, MOCK_JWT_TOKEN_GUIDE);
    await mockCommonRoutes(page, MOCK_JWT_TOKEN_GUIDE);
    await page.route('**/api/rally/v1/guide/checkpoints**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GUIDE_CHECKPOINTS),
      }),
    );

    await page.goto('/rally/guide');

    await expect(page.getByText('Postos — Visão do Guia')).toBeVisible();
    await expect(page.getByText('Posto da Sé')).toBeVisible();
    await expect(page.getByText('Posto do Mercado')).toBeVisible();

    // Expand the first checkpoint card and check guide-only content.
    await page.getByText('Posto da Sé').click();
    await expect(
      page.getByText('Aponta para a estátua e pergunta o nome'),
    ).toBeVisible();
    await expect(page.getByText('Quem é o santo padroeiro?')).toBeVisible();
    await expect(page.getByText('São Domingos')).toBeVisible();
    await expect(page.getByText('Construída no séc. XV')).toBeVisible();
  });

  test('guide checkpoints endpoint failure shows empty state, not crash', async ({
    page,
    context,
  }) => {
    await seedSession(context, MOCK_JWT_TOKEN_GUIDE);
    await mockCommonRoutes(page, MOCK_JWT_TOKEN_GUIDE);
    await page.route('**/api/rally/v1/guide/checkpoints**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Guide mode is not active for this event' }),
      }),
    );

    await page.goto('/rally/guide');

    await expect(page.getByText('Sem postos disponíveis')).toBeVisible();
  });

  test('guide nav entry appears for guide users when feature is on', async ({
    page,
    context,
  }, testInfo) => {
    // The "Gestão" dropdown this test targets is desktop-only nav chrome —
    // mobile groups the same links into the hamburger drawer instead, so
    // there's no equivalent element to assert against here.
    test.skip(testInfo.project.name === 'mobile', 'Desktop-only: "Gestão" dropdown does not exist in the mobile nav');
    await seedSession(context, MOCK_JWT_TOKEN_GUIDE);
    await mockCommonRoutes(page, MOCK_JWT_TOKEN_GUIDE);
    await page.route('**/api/rally/v1/guide/checkpoints**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    await page.goto('/rally/scoreboard');

    // Desktop nav groups the guide entry under the "Gestão" dropdown.
    const managementMenu = page.getByRole('button', { name: 'Gestão' });
    await expect(managementMenu).toBeVisible();
    // The group opens on hover; clicking would toggle it shut again.
    await managementMenu.hover();
    await expect(
      page.getByRole('link', { name: 'Guia', exact: true }).first(),
    ).toBeVisible();
  });

  test('staff also gets access to the guide page', async ({ page, context }) => {
    await seedSession(context, MOCK_JWT_TOKEN_STAFF, ['rally-staff']);
    await mockCommonRoutes(page, MOCK_JWT_TOKEN_STAFF);
    await page.route('**/api/rally/v1/guide/checkpoints**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GUIDE_CHECKPOINTS),
      }),
    );

    await page.goto('/rally/guide');
    await expect(page.getByText('Postos — Visão do Guia')).toBeVisible();
  });
});
