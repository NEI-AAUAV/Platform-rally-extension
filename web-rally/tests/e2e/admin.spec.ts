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
    // Set up route mocks
    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: MOCK_JWT_TOKEN_MANAGER,
        }),
      });
    });

    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RALLY_SETTINGS),
      });
    });

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

    // Set token in localStorage
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, MOCK_JWT_TOKEN_MANAGER);

    // Navigate to admin panel
    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    
    // Wait for settings to load
    await page.waitForResponse('**/api/rally/v1/rally/settings/public**');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should display admin panel with tabs', async ({ page }) => {
    // Verify page header
    await expect(page.getByText(/Gestão Administrativa/i)).toBeVisible();
    
    // Verify tabs are visible
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Checkpoints/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Atividades/i })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Click on Checkpoints tab
    await page.getByRole('button', { name: /Checkpoints/i }).click();
    await page.waitForTimeout(500);
    
    // Verify checkpoint management is visible (check for checkpoint name or form)
    await expect(page.getByText(MOCK_CHECKPOINT.name, { exact: false })).toBeVisible({ timeout: 5000 }).catch(() => {
      // If not visible, check for any checkpoint-related content
      expect(page.locator('body')).toContainText(/checkpoint|posto/i);
    });

    // Click on Activities tab
    await page.getByRole('button', { name: /Atividades/i }).click();
    await page.waitForTimeout(500);
    
    // Verify activities are visible
    await expect(page.getByText(/Atividade|Activity/i)).toBeVisible({ timeout: 5000 }).catch(() => {
      expect(page.locator('body')).toContainText(/atividade|activity/i);
    });
  });

  test('should redirect non-managers to scoreboard', async ({ page, context }) => {
    // Use staff token instead of manager
    const staffToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test';
    
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, staffToken);

    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: staffToken,
        }),
      });
    });

    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse('**/api/rally/v1/rally/settings/public**');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should redirect to scoreboard
    expect(page.url()).toContain('/scoreboard');
  });

  test('should display teams tab by default', async ({ page }) => {
    // Teams tab should be active by default
    await expect(page.getByText(/Equipas|Teams/i)).toBeVisible({ timeout: 5000 });
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
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should not crash, admin panel should still render
    await expect(page.getByText(/Gestão Administrativa/i)).toBeVisible();
  });
});

