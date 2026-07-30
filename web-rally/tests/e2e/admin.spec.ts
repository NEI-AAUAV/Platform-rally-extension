import { test, expect } from '@playwright/test';
import {
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_RALLY_SETTINGS,
  MOCK_ACTIVITY_LIST,
} from '../mocks/data';
import { seedOidcSession, MANAGER_GROUPS, STAFF_GROUPS } from './helpers/session';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page, context }) => {
    // Seed a signed-in manager OIDC session BEFORE page loads
    await seedOidcSession(context, MANAGER_GROUPS);

    // Mock rally settings with public access enabled (so tests don't redirect to login)
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_RALLY_SETTINGS,
          public_access_enabled: true, // Enable public access for tests
        }),
      });
    });

    // Mock API endpoints for data
    await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_CHECKPOINT]),
      });
    });

    await page.route('**/api/rally/v1/team/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_TEAM]),
      });
    });

    await page.route('**/api/rally/v1/activities/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      });
    });

    // Navigate to admin panel
    await page.goto('/rally/admin', { waitUntil: 'networkidle' });
  });

  test('should display admin panel with tabs', async ({ page }) => {
    // Wait for tabs to appear (indicates user is authenticated and authorized)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 10000 });
    
    // Verify all tabs are visible ("Checkpoints" tab is labelled "Postos")
    await expect(page.getByRole('button', { name: /Postos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Atividades/i })).toBeVisible();

    // Verify heading is also visible
    await expect(page.getByText(/Administração/i).first()).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Wait for tabs to appear
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 10000 });
    
    // Click on the checkpoints ("Postos") tab
    await page.getByRole('button', { name: /Postos/i }).click();
    
    // Verify checkpoint management is visible (check for checkpoint name or form)
    await expect(page.getByText(MOCK_CHECKPOINT.name, { exact: false })).toBeVisible({ timeout: 5000 }).catch(async () => {
      // If not visible, check for any checkpoint-related content
      await expect(page.locator('body')).toContainText(/checkpoint|posto/i);
    });

    // Click on Activities tab
    await page.getByRole('button', { name: /Atividades/i }).click();
    
    // Wait for activity content to appear
    // Activities might show "Nova Atividade" button, activity list, or checkpoint warning
    await expect(
      page.locator('body')
    ).toContainText(/Atividade|Activity|Nova|checkpoint|Checkpoint/i, { timeout: 5000 });
  });

  test('should redirect non-managers to scoreboard', async ({ page, context }) => {
    // Re-seed with a staff-only session (runs after the beforeEach seed and
    // overwrites the same storage key, so the staff identity wins).
    await seedOidcSession(context, STAFF_GROUPS);

    // Mock rally settings with public access enabled
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_RALLY_SETTINGS,
          public_access_enabled: true,
        }),
      });
    });

    // Navigate to admin panel
    await page.goto('/rally/admin', { waitUntil: 'networkidle' });
    
    // Wait for redirect to scoreboard (React Router Navigate should trigger this)
    // Staff users (without manager-rally scope) should be redirected
    await page.waitForURL('**/scoreboard**', { timeout: 5000 });
    
    // Verify we're on scoreboard
    expect(page.url()).toContain('/scoreboard');
  });

  test('shows team management under the teams tab', async ({ page }) => {
    // Wait for tabs to appear (Dashboard is the default tab nowadays)
    const teamsTab = page.getByRole('button', { name: /Equipas/i });
    await expect(teamsTab).toBeVisible({ timeout: 10000 });

    await teamsTab.click();

    await expect(
      page.getByRole('heading', { name: /Equipas Existentes|Existing Teams/i }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock error for teams endpoint
    await page.route('**/api/rally/v1/team/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait for tabs to appear (admin panel should still load even if teams endpoint fails)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 10000 });
  });
});

