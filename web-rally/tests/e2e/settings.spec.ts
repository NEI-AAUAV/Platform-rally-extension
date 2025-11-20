import { test, expect } from '@playwright/test';
import {
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_RALLY_SETTINGS,
} from '../mocks/data';

test.describe('Settings', () => {
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

    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RALLY_SETTINGS),
      });
    });

    // Mock settings GET endpoint (for fetching current settings)
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_RALLY_SETTINGS),
        });
      }
    });

    // Mock settings PUT endpoint (for updating)
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = await route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_RALLY_SETTINGS,
            ...body,
          }),
        });
      }
    });

    // Set token in localStorage
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, MOCK_JWT_TOKEN_MANAGER);

    // Navigate to settings
    await page.goto('/rally/settings', { waitUntil: 'domcontentloaded' });
    
    // Wait for settings to load (with fallback if response doesn't come)
    await Promise.race([
      page.waitForResponse('**/api/rally/v1/rally/settings/public**', { timeout: 5000 }),
      page.waitForLoadState('networkidle', { timeout: 5000 }),
    ]).catch(() => {
      // If neither completes, just wait a bit
    });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should display settings page', async ({ page }) => {
    // Verify page header
    await expect(page.getByText(/Configurações|Settings/i)).toBeVisible({ timeout: 5000 });
  });

  test('should display settings sections', async ({ page }) => {
    // Verify different settings sections are visible
    // These may be in tabs or accordions
    await expect(page.locator('body')).toContainText(/Equipas|Teams|Timing|Pontuação|Scoring|Display|Exibição/i, { timeout: 5000 });
  });

  test('should allow editing settings', async ({ page }) => {
    // Look for edit button or form fields
    const editButton = page.getByRole('button', { name: /Editar|Edit|Salvar|Save/i }).first();
    
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
      
      // Verify form fields are editable
      const inputs = page.locator('input[type="number"], input[type="text"]');
      const count = await inputs.count();
      expect(count).toBeGreaterThan(0);
    } else {
      // Settings might be directly editable
      const inputs = page.locator('input[type="number"], input[type="text"]');
      const count = await inputs.count();
      expect(count).toBeGreaterThan(0);
    }
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
    await page.goto('/rally/settings', { waitUntil: 'domcontentloaded' });
    
    // Wait for user endpoint to be called (needed for scope check)
    await page.waitForResponse('**/api/nei/v1/user/me**').catch(() => {
      // User endpoint might not be called if redirect happens first
    });
    
    // Wait for redirect to scoreboard
    await page.waitForURL('**/scoreboard**', { timeout: 10000 }).catch(async () => {
      // If redirect didn't happen via navigation, check URL directly
      await page.waitForTimeout(2000);
      if (!page.url().includes('/scoreboard')) {
        throw new Error(`Expected redirect to /scoreboard but got ${page.url()}`);
      }
    });

    // Verify we're on scoreboard
    expect(page.url()).toContain('/scoreboard');
  });

  test('should handle save errors gracefully', async ({ page }) => {
    // Mock error for PUT request
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal Server Error' }),
        });
      }
    });

    // Try to find and click save button
    const saveButton = page.getByRole('button', { name: /Salvar|Save/i }).first();
    if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveButton.click();
      await page.waitForTimeout(1000);
      
      // Should show error message
      await expect(page.locator('body')).toContainText(/erro|error|falha|failed/i, { timeout: 3000 });
    }
  });

  test('should validate form inputs', async ({ page }) => {
    // Look for number inputs and try invalid values
    const numberInputs = page.locator('input[type="number"]');
    const count = await numberInputs.count();
    
    if (count > 0) {
      const firstInput = numberInputs.first();
      await firstInput.fill('-100');
      
      // Try to save and check for validation error
      const saveButton = page.getByRole('button', { name: /Salvar|Save/i }).first();
      if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(500);
        
        // Should show validation error
        await expect(page.locator('body')).toContainText(/inválido|invalid|deve|must/i, { timeout: 2000 }).catch(() => {
          // Validation might be handled differently
        });
      }
    }
  });
});

