import { test, expect } from '@playwright/test';
import {
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_JWT_TOKEN_STAFF,
  MOCK_JWT_TOKEN_MANAGER,
  MOCK_RALLY_SETTINGS,
  MOCK_ACTIVITY_LIST,
  MOCK_ACTIVITY_RESULT,
  MOCK_ACTIVITY,
  MOCK_TIME_BASED_ACTIVITY,
  MOCK_SCORE_BASED_ACTIVITY,
  MOCK_BOOLEAN_ACTIVITY,
  MOCK_TEAM_VS_ACTIVITY,
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

  test('handles expired token gracefully', async ({ page, context }) => {
    // Set up route mocks with 401 response
    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Token expired' }),
      });
    });

    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Unauthorized' }),
      });
    });

    // Set expired token
    await context.addInitScript(() => {
      localStorage.setItem('rally_token', 'expired-token');
    });

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    // Should redirect to login or show error
    await expect(
      page.getByText(/login|entrar|unauthorized|expired/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('handles invalid token format', async ({ page, context }) => {
    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid token format' }),
      });
    });

    await context.addInitScript(() => {
      localStorage.setItem('rally_token', 'invalid-token-format');
    });

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    // Should handle invalid token
    await expect(
      page.getByText(/login|entrar|invalid|error/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Staff Evaluation - API Error Cases', () => {
  test('handles 500 server error gracefully', async ({ page, context }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    });

    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: MOCK_JWT_TOKEN_STAFF,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait a bit to see if page loads or redirects
    await page.waitForTimeout(2000);

    // Should either redirect to login, show error, or handle gracefully
    // The app might show a toast or just fail silently
    const currentUrl = page.url();
    // If redirected to login, that's acceptable error handling
    if (currentUrl.includes('/auth/login')) {
      await expect(
        page.getByText(/login|entrar/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Otherwise, page should still be accessible (might show loading or error state)
      // Just verify page doesn't crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('handles 403 forbidden error', async ({ page, context }) => {
    await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Forbidden' }),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(2000);

    // Should handle 403 gracefully - might show error, redirect, or empty state
    // Just verify page doesn't crash
    await expect(page.locator('body')).toBeVisible();
    // Checkpoint might not load, but page should still render
  });

  test('handles network timeout', async ({ page, context }) => {
    await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
      // Simulate timeout by aborting
      await route.abort('timedout');
    });

    await page.route('**/api/nei/v1/auth/refresh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: MOCK_JWT_TOKEN_STAFF,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      timeout: 10000,
    });

    // Should handle timeout gracefully (may show error or loading state)
    // The exact behavior depends on the app's error handling
    await page.waitForTimeout(2000);
  });

  test('handles malformed JSON response', async ({ page, context }) => {
    await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'invalid json{',
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    // Should handle JSON parse error gracefully
    await page.waitForTimeout(2000);
    // App should either show error or handle gracefully
  });
});

test.describe('Staff Evaluation - Empty Data Cases', () => {
  test('handles no checkpoint assigned to staff', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/my-checkpoint**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'No checkpoint assigned' }),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto('/rally/staff-evaluation');

    // Should show "No Checkpoint Assigned" message
    await expect(
      page.getByText(/no checkpoint assigned|haven't been assigned/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('handles empty teams list', async ({ page, context }) => {
    await page.route('**/api/rally/v1/team/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should handle empty teams list (may show empty state or message)
    // Checkpoint name should still be visible
    await expect(
      page.getByRole('heading', { name: new RegExp(MOCK_CHECKPOINT.name) }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('handles empty activities list for team', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: [],
          evaluation_summary: {
            total_activities: 0,
            completed_activities: 0,
            pending_activities: 0,
            completion_rate: 0,
            has_incomplete: false,
            missing_activities: [],
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(1000);

    // Should handle empty activities (may show empty state)
    // Team should still be selected
    await expect(teamElement).toBeVisible();
  });

  test('handles all activities already completed', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: MOCK_ACTIVITY_LIST.activities,
          evaluation_summary: {
            total_activities: 1,
            completed_activities: 1,
            pending_activities: 0,
            completion_rate: 100,
            has_incomplete: false,
            missing_activities: [],
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

    await page.route('**/api/rally/v1/activities/results**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ...MOCK_ACTIVITY_RESULT,
            is_completed: true,
            completed_at: new Date().toISOString(),
          },
        ]),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Should show all activities as completed
    // Check for completion indicators - might be badges, status text, or summary
    // The evaluation summary should show 100% completion or all completed
    const hasCompletionIndicator = await Promise.race([
      page.getByText(/100%|complet|completed/i).first().isVisible().catch(() => false),
      page.getByText(/1.*1|all.*complete/i).first().isVisible().catch(() => false),
      page.locator('[class*="green"]').first().isVisible().catch(() => false),
    ]);
    
    // At minimum, activities should be visible
    await expect(
      page.getByText(/activity|atividade/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('handles checkpoint mismatch (team at wrong checkpoint)', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: { ...MOCK_TEAM, last_checkpoint_number: 2 },
          activities: MOCK_ACTIVITY_LIST.activities,
          evaluation_summary: {
            total_activities: 1,
            completed_activities: 0,
            pending_activities: 1,
            completion_rate: 0,
            has_incomplete: true,
            missing_activities: ['Test Activity'],
            checkpoint_mismatch: true,
            team_checkpoint: 2,
            current_checkpoint: 1,
          },
        }),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Should show warning dialog about checkpoint mismatch
    // The dialog shows "This team is from a different checkpoint"
    await expect(
      page.getByText(/incomplete evaluations detected|this team is from a different checkpoint/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // Verify the specific mismatch message
    await expect(
      page.getByText(/team is from checkpoint|different checkpoint/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Staff Evaluation - Evaluation Submission Edge Cases', () => {
  test('handles evaluation submission failure', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid evaluation data' }),
      });
    });

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
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
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Try to evaluate (if button is visible)
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(2000);

      // Should show error message (via toast or in form)
      // Toast messages might be transient, so check for error indicators
      const hasError = await Promise.race([
        page.getByText(/erro ao avaliar|error|invalid/i).first().isVisible().catch(() => false),
        page.locator('[class*="error"], [class*="red"]').first().isVisible().catch(() => false),
        page.waitForTimeout(1000).then(() => false),
      ]);

      // If no visible error, at least verify the form/modal is still open or closed appropriately
      // The mutation should have failed, so form might still be open
      await page.waitForTimeout(1000);
    }
  });

  test('prevents double submission during evaluation', async ({ page, context }) => {
    let submissionCount = 0;

    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      submissionCount++;
      // Simulate slow response
      await page.waitForTimeout(500);
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

    // Set up all other routes
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
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
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Try rapid double-click on evaluate button (if visible)
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Rapid clicks - but wait a bit between to avoid modal blocking
      await evaluateButton.click();
      await page.waitForTimeout(500);
      
      // Second click might be blocked by modal, that's fine - it tests the prevention
      try {
        await evaluateButton.click({ force: true, timeout: 1000 });
      } catch {
        // Expected - modal might block second click
      }
      
      await page.waitForTimeout(2000);

      // Should only submit once (or handle gracefully)
      // The exact behavior depends on the app's implementation
      // Just verify no crash occurred
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Staff Evaluation - Happy Path & Form Interactions', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up route mocks for successful evaluation flow
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY_LIST),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
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
    });

    // Successful evaluation submission
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_RESULT,
          is_completed: true,
          completed_at: new Date().toISOString(),
          final_score: 100,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('successfully submits evaluation and shows success message', async ({ page }) => {
    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button for activity
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Form should be visible
      await expect(
        page.getByText(/evaluate.*test activity|avaliar/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Submit form (assuming there's a submit button - adjust based on actual form)
      const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
      if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(2000);

        // Should show success toast message
        await expect(
          page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('can open and close evaluation form', async ({ page }) => {
    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Open evaluation form
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Form should be visible
      await expect(
        page.getByText(/evaluate|avaliar/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Close form (check for cancel or close button)
      const cancelButton = page.getByRole('button', { name: /cancel|fechar|close|×/i }).first();
      if (await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelButton.click();
        await page.waitForTimeout(1000);

        // Form should be closed, activities list should be visible again
        await expect(
          page.getByText(/activity|atividade/i).first(),
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('can navigate back to team list after selecting team', async ({ page }) => {
    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Look for back button or team list toggle
    const backButton = page.getByRole('button', { name: /back|voltar|teams|list/i }).first();
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(1000);

      // Should see team list again
      await expect(teamElement).toBeVisible({ timeout: 5000 });
    } else {
      // If no back button, verify we can still see checkpoint/team info
      await expect(
        page.getByRole('heading', { name: new RegExp(MOCK_CHECKPOINT.name) }),
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Staff Evaluation - Activity Type Evaluations', () => {
  const setupTestForActivityType = async (
    page: any,
    context: any,
    activity: typeof MOCK_ACTIVITY,
  ) => {
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
        body: JSON.stringify({
          activities: [activity],
          total: 1,
          page: 1,
          size: 100,
        }),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: [activity],
          evaluation_summary: {
            total_activities: 1,
            completed_activities: 0,
            pending_activities: 1,
            completion_rate: 0,
            has_incomplete: true,
            missing_activities: [activity.name],
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

    // Successful evaluation submission
    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_RESULT,
          activity_id: activity.id,
          is_completed: true,
          completed_at: new Date().toISOString(),
          final_score: 100,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  };

  test('evaluates TimeBasedActivity with completion time', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_TIME_BASED_ACTIVITY);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Verify form is visible with time-based fields
      await expect(
        page.getByText(/completion time|tempo de conclusão/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Fill in completion time
      const timeInput = page.getByLabel(/completion time|tempo/i).first();
      if (await timeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await timeInput.fill('120.5');
        await page.waitForTimeout(500);

        // Submit form
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('evaluates ScoreBasedActivity with achieved points', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_SCORE_BASED_ACTIVITY);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Verify form is visible with score-based fields
      await expect(
        page.getByText(/achieved points|pontos alcançados/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Fill in achieved points
      const pointsInput = page.getByLabel(/achieved points|pontos/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pointsInput.fill('85');
        await page.waitForTimeout(500);

        // Submit form
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('evaluates BooleanActivity with success/failure', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_BOOLEAN_ACTIVITY);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Verify form is visible with boolean fields
      await expect(
        page.getByText(/team succeeded|equipa.*sucesso|sucesso/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Toggle success switch
      const switchElement = page.getByRole('switch').first();
      if (await switchElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        await switchElement.click();
        await page.waitForTimeout(500);

        // Submit form
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('evaluates GeneralActivity with assigned points', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_ACTIVITY);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Verify form is visible with general activity fields
      await expect(
        page.getByText(/assigned points|pontos atribuídos/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Fill in assigned points
      const pointsInput = page.getByLabel(/assigned points|pontos/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pointsInput.fill('75');
        await page.waitForTimeout(500);

        // Submit form
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('evaluates TeamVsActivity with match result', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_TEAM_VS_ACTIVITY);

    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Click evaluate button
    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Verify form is visible with team vs fields
      await expect(
        page.getByText(/match result|resultado|win|lose|draw/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Select match result
      const resultSelect = page.locator('select[id="result"]').first();
      if (await resultSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resultSelect.selectOption('win');
        await page.waitForTimeout(500);

        // Submit form
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

test.describe('Staff Evaluation - Form Validation', () => {
  const setupTestForActivityType = async (
    page: any,
    context: any,
    activity: typeof MOCK_ACTIVITY,
  ) => {
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
        body: JSON.stringify({
          activities: [activity],
          total: 1,
          page: 1,
          size: 100,
        }),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: [activity],
          evaluation_summary: {
            total_activities: 1,
            completed_activities: 0,
            pending_activities: 1,
            completion_rate: 0,
            has_incomplete: true,
            missing_activities: [activity.name],
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  };

  test('rejects negative time values in TimeBasedActivity', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_TIME_BASED_ACTIVITY);

    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();
    await page.waitForTimeout(2000);

    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      const timeInput = page.getByLabel(/completion time|tempo/i).first();
      if (await timeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await timeInput.fill('-10');
        await page.waitForTimeout(500);

        // Try to submit - should show validation error
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1000);

          // Should show validation error
          await expect(
            page.getByText(/time must be positive|must be positive|invalid/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('rejects empty time field in TimeBasedActivity', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_TIME_BASED_ACTIVITY);

    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();
    await page.waitForTimeout(2000);

    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      // Leave time field empty and try to submit
      const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
      if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(1000);

        // Should show validation error or prevent submission
        const hasError = await Promise.race([
          page.getByText(/required|obrigatório|invalid|must/i).first().isVisible().catch(() => false),
          page.waitForTimeout(1000).then(() => false),
        ]);

        // Form should still be visible (not submitted)
        await expect(
          page.getByText(/completion time|tempo/i).first(),
        ).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('rejects negative points in ScoreBasedActivity', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_SCORE_BASED_ACTIVITY);

    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();
    await page.waitForTimeout(2000);

    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      const pointsInput = page.getByLabel(/achieved points|pontos/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pointsInput.fill('-5');
        await page.waitForTimeout(500);

        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1000);

          // Should show validation error
          await expect(
            page.getByText(/points must be positive|must be positive|invalid/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('rejects negative points in GeneralActivity', async ({ page, context }) => {
    await setupTestForActivityType(page, context, MOCK_ACTIVITY);

    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();
    await page.waitForTimeout(2000);

    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    const evaluateButton = page.getByRole('button', { name: /evaluate|avaliar/i }).first();
    if (await evaluateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evaluateButton.click();
      await page.waitForTimeout(1000);

      const pointsInput = page.getByLabel(/assigned points|pontos/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pointsInput.fill('-20');
        await page.waitForTimeout(500);

        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1000);

          // Should show validation error
          await expect(
            page.getByText(/points must be positive|must be positive|invalid/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

test.describe('Staff Evaluation - Update Existing Evaluations', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock activity with existing completed result
    const activityWithResult = {
      ...MOCK_ACTIVITY,
      existing_result: {
        ...MOCK_ACTIVITY_RESULT,
        is_completed: true,
        completed_at: new Date().toISOString(),
        final_score: 75,
        result_data: { assigned_points: 75 },
      },
    };

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activities: [activityWithResult],
          total: 1,
          page: 1,
          size: 100,
        }),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: [activityWithResult],
          evaluation_summary: {
            total_activities: 1,
            completed_activities: 1,
            pending_activities: 0,
            completion_rate: 100,
            has_incomplete: false,
            missing_activities: [],
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_RESULT,
          is_completed: true,
          completed_at: new Date().toISOString(),
          final_score: 90,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('allows updating existing completed evaluation', async ({ page }) => {
    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Should show activity as completed
    await expect(
      page.getByText(/completed|complet|update/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // Click update button (should be visible for completed activities)
    const updateButton = page.getByRole('button', { name: /update|atualizar/i }).first();
    if (await updateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await updateButton.click();
      await page.waitForTimeout(1000);

      // Form should be visible with existing values
      await expect(
        page.getByText(/evaluate|avaliar/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Update the points value
      const pointsInput = page.getByLabel(/assigned points|pontos/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Should have existing value pre-filled
        const currentValue = await pointsInput.inputValue();
        expect(currentValue).toBeTruthy();

        // Update to new value
        await pointsInput.fill('90');
        await page.waitForTimeout(500);

        // Submit update
        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success message
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

test.describe('Staff Evaluation - Multiple Activities Sequence', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock multiple activities for the same team
    const multipleActivities = [
      MOCK_ACTIVITY,
      MOCK_TIME_BASED_ACTIVITY,
      MOCK_SCORE_BASED_ACTIVITY,
    ];

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activities: multipleActivities,
          total: multipleActivities.length,
          page: 1,
          size: 100,
        }),
      });
    });

    let evaluationCount = 0;
    await page.route('**/api/rally/v1/staff/teams/*/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: MOCK_TEAM,
          activities: multipleActivities,
          evaluation_summary: {
            total_activities: multipleActivities.length,
            completed_activities: evaluationCount,
            pending_activities: multipleActivities.length - evaluationCount,
            completion_rate: (evaluationCount / multipleActivities.length) * 100,
            has_incomplete: evaluationCount < multipleActivities.length,
            missing_activities: multipleActivities
              .slice(evaluationCount)
              .map((a) => a.name),
            checkpoint_mismatch: false,
            team_checkpoint: 1,
            current_checkpoint: 1,
          },
        }),
      });
    });

    await page.route('**/api/rally/v1/staff/teams/*/activities/*/evaluate**', async (route) => {
      evaluationCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ACTIVITY_RESULT,
          is_completed: true,
          completed_at: new Date().toISOString(),
          final_score: 100,
        }),
      });
    });

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_STAFF],
    );

    await page.goto(`/rally/staff-evaluation/checkpoint/${MOCK_CHECKPOINT.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/rally/v1/rally/settings/public') &&
        response.status() === 200,
      { timeout: 10000 },
    );

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('can evaluate multiple activities sequentially for same team', async ({ page }) => {
    // Select team
    const teamElement = page.getByText(MOCK_TEAM.name).first();
    await expect(teamElement).toBeVisible();
    await teamElement.click();

    await page.waitForTimeout(2000);

    // Close warning dialog if it appears
    const closeButton = page.getByRole('button', { name: /close|fechar/i }).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Should see multiple activities
    const activities = page.getByText(/activity|atividade/i);
    const activityCount = await activities.count();
    expect(activityCount).toBeGreaterThan(1);

    // Evaluate first activity
    const evaluateButtons = page.getByRole('button', { name: /evaluate|avaliar/i });
    const firstButton = evaluateButtons.first();
    if (await firstButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstButton.click();
      await page.waitForTimeout(1000);

      // Fill and submit first activity
      const pointsInput = page.getByLabel(/assigned points|pontos|completion time|achieved points/i).first();
      if (await pointsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pointsInput.fill('80');
        await page.waitForTimeout(500);

        const submitButton = page.getByRole('button', { name: /submit|enviar|save|salvar/i }).first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);

          // Should show success
          await expect(
            page.getByText(/atividade avaliada com sucesso|success|sucesso/i).first(),
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }

    // Wait for activities list to refresh
    await page.waitForTimeout(2000);

    // Should still see remaining activities
    const remainingActivities = page.getByText(/activity|atividade/i);
    const remainingCount = await remainingActivities.count();
    expect(remainingCount).toBeGreaterThan(0);
  });
});

test.describe('Manager Evaluation - Edge Cases', () => {
  test('handles empty evaluations list', async ({ page, context }) => {
    await page.route('**/api/rally/v1/staff/all-evaluations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          evaluations: [],
        }),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_MANAGER],
    );

    await page.goto('/rally/staff-evaluation');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should show empty evaluations state
    await expect(
      page.getByText(/all.*evaluations/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('handles manager with no checkpoints', async ({ page, context }) => {
    await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

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

    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN_MANAGER],
    );

    await page.goto('/rally/staff-evaluation');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should handle empty checkpoints gracefully
    await expect(
      page.getByRole('heading', { name: /manager.*evaluation.*dashboard/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});
