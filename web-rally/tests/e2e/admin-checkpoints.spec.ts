import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

async function mockSettings(page: Page) {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
}

const CHECKPOINTS = [
  { id: 1, name: 'Posto 1', description: 'Primeiro', latitude: 40.63, longitude: -8.65, order: 1, arrival_radius_m: 50 },
];

async function mockCheckpointList(page: Page, checkpoints: unknown[] = CHECKPOINTS) {
  await page.route('**/api/rally/v1/checkpoint/admin/route', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          published_count: checkpoints.length,
          draft_count: 0,
          incomplete_published_ids: [],
          checkpoints,
        }),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/rally/v1/checkpoint/', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(checkpoints) });
    }
    return route.fallback();
  });
}

async function gotoCheckpoints(page: Page) {
  await page.goto('/rally/admin?tab=checkpoints');
}

test.describe('Admin checkpoints', () => {
  test('creates a checkpoint with name, GPS and radius', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page, []);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/checkpoint/', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, ...(capturedBody as object) }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoCheckpoints(page);
    await page.getByPlaceholder('Ex: Checkpoint Central').fill('Posto Novo');
    await page.getByPlaceholder('Ex: 40.6405').fill('40.6306');
    await page.getByPlaceholder('Ex: -8.6538').fill('-8.6591');
    await page.getByPlaceholder('Ex: 50').fill('30');
    // order is auto-assigned (max existing order + 1) — no manual field.
    await page.getByRole('button', { name: 'Criar Checkpoint' }).click();

    await expect.poll(() => capturedBody).toMatchObject({ name: 'Posto Novo', arrival_radius_m: 30, order: 1 });
  });

  test('shows empty state when no checkpoints exist', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page, []);

    await gotoCheckpoints(page);

    await expect(page.getByText('Nenhum checkpoint criado ainda')).toBeVisible();
  });

  test('lists existing checkpoints with name and order', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);

    await gotoCheckpoints(page);

    await expect(page.getByLabel('Checkpoint Posto 1, ordem 1')).toBeVisible();
  });

  test('editing a checkpoint pre-fills the form and updates on submit', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/checkpoint/1', (route) => {
      if (route.request().method() === 'PUT') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, ...(capturedBody as object) }) });
      }
      return route.fallback();
    });

    await gotoCheckpoints(page);
    await page.getByLabel('Checkpoint Posto 1, ordem 1').getByRole('button').nth(1).click();
    await expect(page.getByText('Editar Checkpoint')).toBeVisible();
    const nameInput = page.getByPlaceholder('Ex: Checkpoint Central');
    await expect(nameInput).toHaveValue('Posto 1');
    await nameInput.fill('Posto 1 Renomeado');
    await page.getByRole('button', { name: 'Atualizar Checkpoint' }).click();

    await expect.poll(() => (capturedBody as { name?: string })?.name).toBe('Posto 1 Renomeado');
  });

  test('deleting a checkpoint calls the delete endpoint', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);
    let deleteCalled = false;
    await page.route('**/api/rally/v1/checkpoint/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await gotoCheckpoints(page);
    const buttons = page.getByLabel('Checkpoint Posto 1, ordem 1').getByRole('button');
    await buttons.nth(2).click();

    await expect.poll(() => deleteCalled).toBe(true);
  });

  test('duplicate order on create shows an error toast', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);
    await page.route('**/api/rally/v1/checkpoint/', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Checkpoint with order 1 already exists' }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKPOINTS) });
    });

    await gotoCheckpoints(page);
    await page.getByPlaceholder('Ex: Checkpoint Central').fill('Posto Duplicado');
    await page.getByRole('button', { name: 'Criar Checkpoint' }).click();

    await expect(page.getByText(/already exists/)).toBeVisible();
  });

  test('media upload without R2 configured shows a 503 error', async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);
    await page.route('**/api/rally/v1/checkpoint/1/media', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Image upload is disabled: R2 storage is not configured.' }),
      });
    });
    await page.route('**/api/rally/v1/checkpoint/1/guide-indications', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await gotoCheckpoints(page);
    await page.getByLabel('Fotos e curiosidades do sítio').click();
    const fileInput = page.locator('input[type="file"]:not([aria-label="Imagem do enigma"])');
    await fileInput.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

    await expect(page.getByText(/R2 storage is not configured/)).toBeVisible();
  });

  test('adding a guide indication requires a hint and calls create endpoint', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockCheckpointList(page);
    await page.route('**/api/rally/v1/checkpoint/1/media', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    let capturedBody: unknown;
    await page.route('**/api/rally/v1/checkpoint/1/guide-indications', (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, ...(capturedBody as object) }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await gotoCheckpoints(page);
    await page.getByLabel('Fotos e curiosidades do sítio').click();
    const addButton = page.getByRole('button', { name: 'Adicionar indicação' });
    await expect(addButton).toBeDisabled();
    await page.getByPlaceholder(/Indicação a dar à equipa/).fill('Aponta para a estátua');
    await expect(addButton).toBeEnabled();
    await addButton.click();

    await expect.poll(() => (capturedBody as { hint?: string })?.hint).toBe('Aponta para a estátua');
  });
});
