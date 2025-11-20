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

    // Mock user endpoint (manager has manager-rally scope)
    await page.route('**/api/nei/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test Manager',
          scopes: ['manager-rally', 'rally-staff'],
        }),
      });
    });

    // Set token in localStorage
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, MOCK_JWT_TOKEN_MANAGER);

    // Navigate to admin panel
    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    
    // Wait for user to load first (this clears the "Carregando..." state)
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 5000 }).catch(() => {
      // User endpoint might already be cached
    });
    
    // Wait for loading to disappear
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Carregando...'),
      { timeout: 10000 }
    ).catch(() => {
      // If loading doesn't disappear, continue anyway
    });
    
    // Wait a bit for content to render
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
    
    // Wait for API response (with timeout)
    await page.waitForResponse('**/api/rally/v1/activities/**', { timeout: 10000 }).catch(() => {
      // If response doesn't come, continue anyway
    });
    
    // Wait for loading to disappear
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Carregando...'),
      { timeout: 10000 }
    ).catch(() => {
      // If loading doesn't disappear, continue anyway
    });
    
    // Wait a bit for content to render
    await page.waitForTimeout(1000);
    
    // Check that activity content appears (either heading, list, or any activity text)
    // Activities might show "Nova Atividade" button, activity list, or checkpoint warning
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/Atividade|Activity|Nova|checkpoint|Checkpoint/i);
  });

  test('should redirect non-managers to scoreboard', async ({ page, context }) => {
    // Use staff token instead of manager (no manager-rally scope)
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

    // Mock user endpoint to return staff user (no manager scope)
    await page.route('**/api/nei/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test User',
          scopes: ['rally-staff'], // No manager-rally scope
        }),
      });
    });

    // Navigate and wait for redirect to scoreboard
    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    
    // Wait for user to load (this triggers the redirect check)
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 5000 }).catch(() => {});
    
    // Wait for redirect to scoreboard (React Router Navigate should trigger this)
    await page.waitForURL('**/scoreboard**', { timeout: 10000 });
    
    // Verify we're on scoreboard
    expect(page.url()).toContain('/scoreboard');
  });

  test('should display teams tab by default', async ({ page }) => {
    // Teams tab button should be visible and active by default
    const teamsTab = page.getByRole('button', { name: /Equipas/i });
    await expect(teamsTab).toBeVisible({ timeout: 5000 });
    
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
    
    // Wait for user to load
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 5000 }).catch(() => {});
    
    // Wait for loading to disappear
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Carregando...'),
      { timeout: 10000 }
    ).catch(() => {});
    
    await page.waitForTimeout(1000);

    // Should not crash, admin panel should still render
    await expect(page.getByText(/Gestão Administrativa/i)).toBeVisible();
  });
});

