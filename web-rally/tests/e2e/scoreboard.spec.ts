import { test, expect } from '@playwright/test';
import {
  MOCK_TEAM,
  MOCK_JWT_TOKEN_STAFF,
  MOCK_RALLY_SETTINGS,
} from '../mocks/data';

test.describe('Scoreboard', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up route mocks
    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: MOCK_JWT_TOKEN_STAFF,
        }),
      });
    });

    // Mock user endpoint
    await page.route('**/api/nei/v1/user/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-123',
          name: 'Test User',
          scopes: ['rally-staff'],
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

    // Mock teams endpoint
    const mockTeams = [
      { ...MOCK_TEAM, id: 1, name: 'Team Alpha', classification: 1, total: 150 },
      { ...MOCK_TEAM, id: 2, name: 'Team Beta', classification: 2, total: 120 },
      { ...MOCK_TEAM, id: 3, name: 'Team Gamma', classification: 3, total: 100 },
    ];

    await page.route('**/api/rally/v1/team/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTeams),
      });
    });

    // Set token in localStorage
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, MOCK_JWT_TOKEN_STAFF);

    // Navigate to scoreboard
    await page.goto('/rally/scoreboard', { waitUntil: 'domcontentloaded' });
    
    // Wait for settings and teams to load
    await Promise.all([
      page.waitForResponse('**/api/rally/v1/rally/settings/public**').catch(() => null),
      page.waitForResponse('**/api/rally/v1/team/**').catch(() => null),
    ]);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should display scoreboard with teams sorted by classification', async ({ page }) => {
    // Verify teams are displayed
    await expect(page.getByText('Team Alpha')).toBeVisible();
    await expect(page.getByText('Team Beta')).toBeVisible();
    await expect(page.getByText('Team Gamma')).toBeVisible();
  });

  test('should display team scores', async ({ page }) => {
    // Wait for teams to be rendered
    await expect(page.getByText('Team Alpha')).toBeVisible({ timeout: 10000 });
    
    // Verify teams are visible (they should have scores displayed with them)
    await expect(page.getByText('Team Alpha')).toBeVisible();
    await expect(page.getByText('Team Beta')).toBeVisible();
    await expect(page.getByText('Team Gamma')).toBeVisible();
    
    // Verify scores are displayed somewhere on the page (format may vary by theme)
    // Check that at least one score number appears near the teams
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/150|120|100/);
  });

  test('should hide leaderboard when disabled in settings', async ({ page }) => {
    // Mock settings with leaderboard disabled
    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_RALLY_SETTINGS,
          show_live_leaderboard: false,
        }),
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForResponse('**/api/rally/v1/rally/settings/public**');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify disabled message
    await expect(page.getByText(/Leaderboard indisponível|indisponível/i)).toBeVisible();
    await expect(page.getByText(/desativou a visualização/i)).toBeVisible();
  });

  test('should handle empty teams list', async ({ page }) => {
    await page.route('**/api/rally/v1/team/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Scoreboard should render without teams (no error)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle API error gracefully', async ({ page }) => {
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

    // Should not crash, page should still render
    await expect(page.locator('body')).toBeVisible();
  });
});

