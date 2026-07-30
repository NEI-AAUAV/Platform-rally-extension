import { test, expect, type Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';
import type { RallySettingsResponse } from '@/client';

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }),
  );
}

test.describe('Rules', () => {
  test('renders heading and default-open "how it works" section', async ({ page }) => {
    await mockSettings(page);

    await page.goto('/rally/rules');

    await expect(page.getByText('Regras & FAQ')).toBeVisible();
    await expect(
      page.getByText('Os postos devem ser visitados pela ordem definida.'),
    ).toBeVisible();
  });

  test('shows unordered-checkpoint copy when checkpoint_order_matters is false', async ({ page }) => {
    await mockSettings(page, { checkpoint_order_matters: false });

    await page.goto('/rally/rules');

    await expect(
      page.getByText('Os postos podem ser visitados por qualquer ordem.'),
    ).toBeVisible();
  });

  test('expands and collapses an accordion section on click', async ({ page }) => {
    await mockSettings(page);

    await page.goto('/rally/rules');

    const scoreButton = page.getByRole('button', { name: 'Pontuação' });
    await expect(scoreButton).toHaveAttribute('aria-expanded', 'false');
    await scoreButton.click();
    await expect(scoreButton).toHaveAttribute('aria-expanded', 'true');
    await scoreButton.click();
    await expect(scoreButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('shows hidden-leaderboard note when show_live_leaderboard is false', async ({ page }) => {
    await mockSettings(page, { show_live_leaderboard: false });

    await page.goto('/rally/rules');

    await page.getByRole('button', { name: 'Pontuação' }).click();
    await expect(page.getByText(/leaderboard ao vivo pode estar oculto/)).toBeVisible();
  });

  test('shows tasca penalty/bonus bullets when configured', async ({ page }) => {
    await mockSettings(page, {
      bonus_per_extra_shot: 2,
      max_extra_shots_per_member: 3,
      penalty_per_puke: -10,
      penalty_per_not_drinking: -5,
    });

    await page.goto('/rally/rules');

    await page.getByRole('button', { name: 'Pontuação' }).click();
    await expect(page.getByText(/por cada shot extra/)).toBeVisible();
    await expect(page.getByText(/por cada vómito/)).toBeVisible();
    await expect(page.getByText(/por cada membro que não bebe/)).toBeVisible();
  });

  test('hides tasca bullets when all penalty/bonus values are zero', async ({ page }) => {
    await mockSettings(page, {
      bonus_per_extra_shot: 0,
      penalty_per_puke: 0,
      penalty_per_not_drinking: 0,
    });

    await page.goto('/rally/rules');

    await page.getByRole('button', { name: 'Pontuação' }).click();
    await expect(page.getByText(/por cada shot extra/)).toHaveCount(0);
  });

  test('shows Versus section when enable_versus is true', async ({ page }) => {
    await mockSettings(page, { enable_versus: true });

    await page.goto('/rally/rules');

    await expect(page.getByRole('button', { name: 'Modo Versus' })).toBeVisible();
  });

  test('hides Versus section when enable_versus is false', async ({ page }) => {
    await mockSettings(page, { enable_versus: false });

    await page.goto('/rally/rules');

    await expect(page.getByRole('button', { name: 'Modo Versus' })).toHaveCount(0);
  });

  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);

    await page.goto('/rally/rules');

    await expect(page.getByText('Regras & FAQ')).toBeVisible();
  });
});
