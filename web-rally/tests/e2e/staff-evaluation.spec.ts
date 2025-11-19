import { test, expect } from '@playwright/test';
import {
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_JWT_TOKEN_STAFF,
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_RALLY_SETTINGS,
  MOCK_ACTIVITY_LIST,
  MOCK_ACTIVITY_RESULT,
} from '../../src/test/mocks/data';

test.describe('Staff Evaluation Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up route mocks BEFORE navigation (Playwright route mocking works in browser)
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
      const url = new URL(route.request().url());
      const checkpointId = url.searchParams.get('checkpoint_id');
      
      const activities = checkpointId
        ? MOCK_ACTIVITY_LIST.activities.filter(
            (activity) => activity.checkpoint_id === Number(checkpointId),
          )
        : MOCK_ACTIVITY_LIST.activities;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_LIST,
          activities,
          total: activities.length,
        }),
      });
    });

    await page.route('**/api/rally/v1/activities/results**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_ACTIVITY_RESULT]),
      });
    });

    // Staff-specific endpoint: get my checkpoint
    await page.route('**/api/rally/v1/staff/my-checkpoint**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CHECKPOINT),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      const url = new URL(route.request().url());
      const teamIdMatch = url.pathname.match(/\/teams\/(\d+)\/activities/);
      const teamId = teamIdMatch ? Number(teamIdMatch[1]) : null;

      if (teamId === MOCK_TEAM.id) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            team: MOCK_TEAM,
            activities: MOCK_ACTIVITY_LIST.activities,
            evaluation_summary: {
              total_activities: 1,
              completed_activities: 0,
              pending_activities: 1,
              completion_rate: 0,
              has_incomplete: true,
              missing_activities: ['Test Activity'],
              checkpoint_mismatch: false,
              team_checkpoint: 1,
              current_checkpoint: 1,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Not found' }),
        });
      }
    });

    // Submit evaluation endpoint
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_RESULT,
          is_completed: true,
          completed_at: new Date().toISOString(),
        }),
      });
    });

    // Set mock JWT token in localStorage before navigation
    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    // Navigate to staff evaluation page
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for settings to load (this prevents redirect to login)
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    // Wait for app to initialize
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on the staff evaluation page (not redirected to login)
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/login')) {
      throw new Error(
        `Unexpected redirect to login. Current URL: ${currentUrl}. This usually means authentication failed or settings didn't load.`,
      );
    }
    
    // Give React time to render
    await page.waitForTimeout(1000);
  });

  test('displays checkpoint name', async ({ page }) => {
    // Verify checkpoint name is displayed in the heading
    // Use getByRole to target the heading specifically
    await expect(
      page.getByRole('heading', { name: new RegExp(MOCK_CHECKPOINT.name) }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays teams list', async ({ page }) => {
    // Wait for teams to load - use first() to handle multiple matches
    await expect(
      page.getByText(MOCK_TEAM.name).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('allows selecting a team', async ({ page }) => {
    // Wait for team list to appear - use first() to handle multiple matches
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();

    // Click on team to select it
    await teamElement.click();

    // Verify team is selected (check for team details or activities)
    // The exact selector depends on your component structure
    await expect(page.getByRole('button', { name: /evaluate|avaliar/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays activities for selected team', async ({ page }) => {
    // Select team - use first() to handle multiple matches
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    // Wait for activities to load
    // Adjust selector based on your component
    await expect(
      page.getByText(/activity|atividade/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows evaluation summary', async ({ page }) => {
    // Select team - use first() to handle multiple matches
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    // Wait for evaluation summary to appear
    // This might show pending activities, completion rate, etc.
    await expect(
      page.getByText(/pending|pendente|summary|resumo/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('handles checkpoint not found gracefully', async ({ page }) => {
    // Navigate to non-existent checkpoint
    await page.goto('/rally/staff-evaluation/checkpoint/999');

    // Should show error message
    await expect(
      page.getByText(/not found|não encontrado|erro/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Manager Evaluation Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up route mocks for manager evaluation
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

    // Manager-specific endpoint: all evaluations
    await page.route('**/api/rally/v1/staff/all-evaluations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          evaluations: [
            {
              ...MOCK_ACTIVITY_RESULT,
              team: MOCK_TEAM,
              activity: MOCK_ACTIVITY_LIST.activities[0],
            },
          ],
        }),
      });
    });

    // Set manager token in localStorage
    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_MANAGER],
    );

    // Navigate to manager evaluation page
    await page.goto('/rally/staff-evaluation', {
      waitUntil: 'domcontentloaded',
    });

    // Wait for settings to load
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    // Wait for app to initialize
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the manager evaluation page
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/login')) {
      throw new Error(
        `Unexpected redirect to login. Current URL: ${currentUrl}. This usually means authentication failed or settings didn't load.`,
      );
    }
    
    // Give React time to render
    await page.waitForTimeout(1000);
  });

  test('displays manager evaluation dashboard', async ({ page }) => {
    // Verify manager dashboard is displayed
    await expect(
      page.getByRole('heading', { name: /manager.*evaluation.*dashboard/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays all checkpoints for manager', async ({ page }) => {
    // Manager should see all checkpoints
    await expect(
      page.getByText(MOCK_CHECKPOINT.name, { exact: false }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays all teams for manager', async ({ page }) => {
    // Manager should see all teams
    await expect(
      page.getByText(MOCK_TEAM.name).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays all evaluations section', async ({ page }) => {
    // Manager should see "All Evaluations" section
    await expect(
      page.getByText(/all.*evaluations/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to checkpoint evaluation as manager', async ({ page }) => {
    // Click on a checkpoint to navigate to its evaluation page
    const checkpointElement = page.getByText(MOCK_CHECKPOINT.name).first();
    await expect(checkpointElement).toBeVisible();
    await checkpointElement.click();

    // Should navigate to checkpoint evaluation page
    await page.waitForURL(
      (url) => url.pathname.includes(`/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`),
      { timeout: 5000 },
    );

    // Verify checkpoint name is displayed
    await expect(
      page.getByRole('heading', { name: new RegExp(MOCK_CHECKPOINT.name) }),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Staff Evaluation - Authentication', () => {
  test('redirects to login when not authenticated', async ({ page, context }) => {
    // Clear localStorage to simulate logged-out state
    await context.addInitScript(() => {
      localStorage.clear();
    });

    // Navigate to protected page
    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    // Should redirect to login or show error
    // Adjust based on your auth flow
    await expect(
      page.getByText(/login|entrar|autenticação/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
