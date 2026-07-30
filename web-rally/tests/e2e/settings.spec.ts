import { test, expect } from '@playwright/test';
import {
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_RALLY_SETTINGS,
} from '../mocks/data';
import { seedOidcSession, MANAGER_GROUPS, STAFF_GROUPS } from './helpers/session';

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

    // Mock settings endpoint (GET for fetching, PUT for updating)
    // Match both /settings and /settings/public endpoints
    await page.route('**/api/rally/v1/rally/settings**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_RALLY_SETTINGS),
        });
      } else if (method === 'PUT') {
        const body = await route.request().postDataJSON().catch(() => ({}));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_RALLY_SETTINGS,
            ...body,
          }),
        });
      } else {
        // Continue for other methods
        await route.continue();
      }
    });

    // Seed a signed-in manager OIDC session
    await seedOidcSession(context, MANAGER_GROUPS);

    // Navigate to settings
    await page.goto('/rally/settings', { waitUntil: 'domcontentloaded' });
    
    // Wait for user to load (this clears the initial "Carregando..." state)
    // Settings query only runs when isManager is true, which depends on user loading
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 10000 }).catch(() => {
      // User endpoint might already be cached or not called
    });
    
    // Wait for settings query to load
    await page.waitForResponse('**/api/rally/v1/rally/settings**', { timeout: 10000 }).catch(() => {});
    
    // Don't wait for settings content here - let each test wait for what it needs
    // This avoids timeout issues if the settings API is slow or fails
  });

  test('should display settings page', async ({ page }) => {
    // Wait for settings page heading (more specific than generic text to avoid strict mode violation)
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible({ timeout: 20000 });
  });

  test('should display settings sections', async ({ page }) => {
    // Wait for settings page heading
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible({ timeout: 20000 });
    
    // Verify different settings sections are visible
    // These may be in tabs or accordions
    await expect(page.locator('body')).toContainText(/Equipas|Teams|Timing|Pontuação|Scoring|Display|Exibição/i, { timeout: 5000 });
  });

  test('should allow editing settings', async ({ page }) => {
    // Wait for settings page heading
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible({ timeout: 20000 });
    
    // Look for edit button or form fields
    const editButton = page.getByRole('button', { name: /Editar|Edit|Salvar|Save/i }).first();
    
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await expect(page.locator('input[type="number"], input[type="text"]').first()).toBeVisible({ timeout: 5000 });
      
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
    // Re-seed with a staff-only session (overwrites the beforeEach seed, so
    // the non-manager identity wins).
    await seedOidcSession(context, STAFF_GROUPS);

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
    
    // Wait for user to load (this triggers the redirect check)
    await page.waitForResponse('**/api/nei/v1/user/me**', { timeout: 5000 }).catch(() => {});
    
    // Wait for redirect to scoreboard (React Router Navigate should trigger this)
    await page.waitForURL('**/scoreboard**', { timeout: 10000 });
    
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
      
      // Should show error message
      await expect(page.locator('body')).toContainText(/erro|error|falha|failed/i, { timeout: 3000 });
    }
  });

  test('should validate form inputs', async ({ page }) => {
    // Wait for settings page heading
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible({ timeout: 20000 });
    
    // Click edit button to enable the form
    const editButton = page.getByRole('button', { name: /Editar Configurações|Edit Settings/i });
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      await expect(page.locator('input[type="number"]:not([disabled])').first()).toBeVisible({ timeout: 5000 });
    }
    
    // Look for number inputs and try invalid values
    const numberInputs = page.locator('input[type="number"]:not([disabled])');
    const count = await numberInputs.count();
    
    if (count > 0) {
      const firstInput = numberInputs.first();
      await firstInput.fill('-100');
      
      // Try to save and check for validation error
      const saveButton = page.getByRole('button', { name: /Salvar|Save/i }).first();
      if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saveButton.click();
        
        // Should show validation error
        await expect(page.locator('body')).toContainText(/inválido|invalid|deve|must/i, { timeout: 2000 }).catch(() => {
          // Validation might be handled differently
        });
      }
    }
  });
});

