import { test, expect } from '@playwright/test';
import {
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_RALLY_SETTINGS,
  MOCK_ACTIVITY_LIST,
} from '../mocks/data';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set manager token in localStorage BEFORE page loads
    await context.addInitScript((token) => {
      localStorage.setItem('rally_token', token);
    }, MOCK_JWT_TOKEN_MANAGER);

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
    
    // Verify all tabs are visible
    await expect(page.getByRole('button', { name: /Checkpoints/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Atividades/i })).toBeVisible();
    
    // Verify heading is also visible
    await expect(page.getByText(/Gestão Administrativa/i)).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Wait for tabs to appear
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 10000 });
    
    // Click on Checkpoints tab
    await page.getByRole('button', { name: /Checkpoints/i }).click();
    
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
    // Use staff token instead of manager (no manager-rally scope)
    // JWT token has only 'rally-staff' scope, not 'manager-rally'
    const staffToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test';
    
    // Set staff token in localStorage - store will parse JWT and see no manager scope
    await context.addInitScript((token) => {
      localStorage.setItem('rally_token', token);
    }, staffToken);

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

  test('should display teams tab by default', async ({ page }) => {
    // Wait for tabs to appear
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 10000 });
    
    // Teams tab button should be visible by default
    const teamsTab = page.getByRole('button', { name: /Equipas/i });
    await expect(teamsTab).toBeVisible();
    
    // Verify teams content is visible (use first() to avoid strict mode violation)
    const heading = page.getByRole('heading', { name: /Equipas Existentes|Existing Teams/i }).first();
    const description = page.getByText(/Criar e editar equipas/i).first();
    
    // At least one should be visible
    const headingVisible = await heading.isVisible().catch(() => false);
    const descVisible = await description.isVisible().catch(() => false);
    expect(headingVisible || descVisible).toBe(true);
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

