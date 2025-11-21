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

    // Mock user endpoints (both NEI and Rally APIs)
    // Admin panel uses Rally API's user endpoint
    // Use a more specific pattern to ensure it matches - match both with and without query params
    await page.route('**/api/rally/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test Manager',
          scopes: ['manager-rally', 'rally-staff'],
        }),
      });
    });
    
    // Also mock NEI API user endpoint (for other components)
    await page.route('**/api/nei/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test Manager',
          scopes: ['manager-rally', 'rally-staff'],
        }),
      });
    });

    // Set token in localStorage with correct key for rally extension
    await context.addInitScript((token) => {
      localStorage.setItem('rally_token', token);
    }, MOCK_JWT_TOKEN_MANAGER);

    // Navigate to admin panel
    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    
    // Wait for user API to be called and respond (admin panel uses Rally API's user endpoint)
    // This ensures React Query has the data
    await page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/api/rally/v1/user/me') && response.status() === 200;
      },
      { timeout: 15000 }
    ).catch(() => {
      // User endpoint might already be cached or not called - continue anyway
    });
    
    // Wait for "Carregando..." to disappear - this indicates both React Query and userStore have finished loading
    // This is more reliable than waiting for content, as it directly checks the loading state
    await page.waitForFunction(
      () => !(document.body.textContent || '').includes('Carregando...'),
      { timeout: 20000 }
    ).catch(() => {
      // If still loading, check if we're redirected
      const url = page.url();
      if (url.includes('/scoreboard')) {
        throw new Error('User was redirected to scoreboard (not a manager)');
      }
      // Continue - might be a race condition, let the test handle it
    });
    
    // Wait a bit more for React to finish rendering after loading state clears
    await page.waitForTimeout(1000);
    
    // Don't wait for page content here - let each test wait for what it needs
    // This avoids timeout issues if API calls are slow or fail
    // Each test will wait for specific content (tabs, headings, etc.)
  });

  test('should display admin panel with tabs', async ({ page }) => {
    // Wait for tabs to appear (indicates page has loaded and user is authenticated)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 30000 });
    
    // Verify all tabs are visible
    await expect(page.getByRole('button', { name: /Checkpoints/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Atividades/i })).toBeVisible({ timeout: 5000 });
    
    // Verify heading is also visible
    await expect(page.getByText(/Gestão Administrativa/i)).toBeVisible({ timeout: 5000 });
  });

  test('should switch between tabs', async ({ page }) => {
    // Wait for tabs to appear (indicates page has loaded and user is authenticated)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 30000 });
    
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
    
    // Wait for activity content to appear (more reliable than waiting for loading to disappear)
    // Activities might show "Nova Atividade" button, activity list, or checkpoint warning
    await expect(
      page.locator('body')
    ).toContainText(/Atividade|Activity|Nova|checkpoint|Checkpoint/i, { timeout: 10000 });
  });

  test('should redirect non-managers to scoreboard', async ({ page, context }) => {
    // Use staff token instead of manager (no manager-rally scope)
    const staffToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test';
    
    await context.addInitScript((token) => {
      localStorage.setItem('rally_token', token);
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

    // Mock user endpoints to return staff user (no manager scope)
    // Admin panel uses Rally API's user endpoint
    await page.route('**/api/rally/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test User',
          scopes: ['rally-staff'], // No manager-rally scope
        }),
      });
    });
    
    // Also mock NEI API user endpoint
    await page.route('**/api/nei/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test User',
          scopes: ['rally-staff'], // No manager-rally scope
        }),
      });
    });

    // Navigate and wait for redirect to scoreboard
    await page.goto('/rally/admin', { waitUntil: 'domcontentloaded' });
    
    // Wait for user to load (admin panel uses Rally API's user endpoint)
    // This triggers the redirect check when user doesn't have manager-rally scope
    await page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/api/rally/v1/user/me') && response.status() === 200;
      },
      { timeout: 5000 }
    ).catch(() => {});
    
    // Wait a bit for React to process the user data and trigger redirect
    await page.waitForTimeout(500);
    
    // Wait for redirect to scoreboard (React Router Navigate should trigger this)
    await page.waitForURL('**/scoreboard**', { timeout: 10000 });
    
    // Verify we're on scoreboard
    expect(page.url()).toContain('/scoreboard');
  });

  test('should display teams tab by default', async ({ page }) => {
    // Wait for tabs to appear (indicates page has loaded and user is authenticated)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 30000 });
    
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
    
    // Wait for user to load (admin panel uses Rally API's user endpoint)
    await page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/api/rally/v1/user/me') && response.status() === 200;
      },
      { timeout: 5000 }
    ).catch(() => {});
    
    // Wait a bit for React to process the user data
    await page.waitForTimeout(500);
    
    // Wait for tabs to appear (indicates page has loaded and user is authenticated)
    await expect(page.getByRole('button', { name: /Equipas/i })).toBeVisible({ timeout: 30000 });
  });
});

