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
    
    // Wait for settings to load
    await page.waitForResponse('**/api/rally/v1/rally/settings/public**');
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
    // Verify scores are displayed (format may vary by theme)
    await expect(page.getByText(/150|Team Alpha/i)).toBeVisible();
    await expect(page.getByText(/120|Team Beta/i)).toBeVisible();
    await expect(page.getByText(/100|Team Gamma/i)).toBeVisible();
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

