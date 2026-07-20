import { test, expect } from '@playwright/test';
import { mintToken, apiCall } from './helpers/fullstackAuth';
import { seedRally, waitForApi } from './helpers/seedRally';

/**
 * Scoring-arithmetic-vs-oracle: reimplements api-rally's scoring formulas
 * (app/models/activities/{boolean,score_based}.py + base.py's apply_modifiers)
 * independently in TS, seeds real evaluations against the live backend, and
 * asserts the server-computed final_score matches the oracle exactly. Catches
 * silent scoring-formula drift between backend and any docs/frontend
 * assumption about how points are computed, which unit tests within api-rally
 * alone can't — those only assert the implementation against itself.
 */

const EXTRA_SHOT_BONUS = 5; // app/core/config.py default; overridden per-test via rally settings when needed.

function booleanOracle(success: boolean, successPoints = 100, failurePoints = 0): number {
  return success ? successPoints : failurePoints;
}

function scoreBasedOracle(achievedPoints: number, maxPoints = 100, baseScore = 50): number {
  const percentage = Math.min(achievedPoints / maxPoints, 1.0);
  return baseScore * percentage;
}

function applyModifiersOracle(
  baseScore: number,
  { extraShots = 0, bonusPerShot = EXTRA_SHOT_BONUS, penalties = {} as Record<string, number> } = {},
): number {
  let final = baseScore;
  if (extraShots > 0) final += extraShots * bonusPerShot;
  for (const value of Object.values(penalties)) final -= value;
  return Math.max(0, final);
}

test.describe('Scoring arithmetic vs. real backend oracle', () => {
  test.beforeAll(async () => {
    await waitForApi();
  });

  test('boolean activity success score matches the oracle exactly', async ({ page }) => {
    const rally = await seedRally();

    await apiCall('POST', '/checkpoint/staff-check-in', {
      token: rally.admin.accessToken,
      body: { team_code: rally.accessCode, checkpoint_id: rally.checkpointId },
    });
    await apiCall('POST', `/staff/teams/${rally.teamId}/activities/${rally.activityId}/evaluate`, {
      token: rally.admin.accessToken,
      body: { result_data: { success: true }, extra_shots: 0, penalties: {} },
    });

    const results = await apiCall<{ final_score: number }[]>(
      'GET',
      `/staff/teams/${rally.teamId}/activities`,
      { token: rally.admin.accessToken },
    );
    const actual = results.find((r) => (r as unknown as { activity_id: number }).activity_id === rally.activityId)!
      .final_score;

    expect(actual).toBe(booleanOracle(true));
    void page;
  });

  test('extra-shots bonus and penalties combine exactly as apply_modifiers computes server-side', async () => {
    const rally = await seedRally();

    await apiCall('POST', '/checkpoint/staff-check-in', {
      token: rally.admin.accessToken,
      body: { team_code: rally.accessCode, checkpoint_id: rally.checkpointId },
    });
    const evaluated = await apiCall<{ id: number }>(
      'POST',
      `/staff/teams/${rally.teamId}/activities/${rally.activityId}/evaluate`,
      { token: rally.admin.accessToken, body: { result_data: { success: true }, extra_shots: 0, penalties: {} } },
    );
    const resultId = evaluated.id;

    // Read current rally settings to use the real bonus-per-shot in the oracle
    // rather than assuming the config default.
    const settings = await apiCall<{ bonus_per_extra_shot: number }>('GET', '/rally/settings', {
      token: rally.admin.accessToken,
    });

    await apiCall('POST', `/activities/results/${resultId}/extra-shots?extra_shots=2`, {
      token: rally.admin.accessToken,
    });
    await apiCall('POST', `/activities/results/${resultId}/penalty?penalty_type=vomit&penalty_value=10`, {
      token: rally.admin.accessToken,
    });

    const results = await apiCall<{ final_score: number }[]>(
      'GET',
      `/staff/teams/${rally.teamId}/activities`,
      { token: rally.admin.accessToken },
    );
    const actual = results.find((r) => (r as unknown as { activity_id: number }).activity_id === rally.activityId)!
      .final_score;

    const expected = applyModifiersOracle(booleanOracle(true), {
      extraShots: 2,
      bonusPerShot: settings.bonus_per_extra_shot,
      penalties: { vomit: 10 },
    });
    expect(actual).toBe(expected);
  });

  test('penalties cannot drive a score below zero — server clamps exactly like the oracle', async () => {
    const rally = await seedRally();

    await apiCall('POST', '/checkpoint/staff-check-in', {
      token: rally.admin.accessToken,
      body: { team_code: rally.accessCode, checkpoint_id: rally.checkpointId },
    });
    const evaluated = await apiCall<{ id: number }>(
      'POST',
      `/staff/teams/${rally.teamId}/activities/${rally.activityId}/evaluate`,
      { token: rally.admin.accessToken, body: { result_data: { success: true }, extra_shots: 0, penalties: {} } },
    );
    // success = 100 points; apply a penalty far larger than the base score.
    await apiCall(
      'POST',
      `/activities/results/${evaluated.id}/penalty?penalty_type=not_drinking&penalty_value=500`,
      { token: rally.admin.accessToken },
    );

    const results = await apiCall<{ final_score: number }[]>(
      'GET',
      `/staff/teams/${rally.teamId}/activities`,
      { token: rally.admin.accessToken },
    );
    const actual = results.find((r) => (r as unknown as { activity_id: number }).activity_id === rally.activityId)!
      .final_score;

    expect(actual).toBe(applyModifiersOracle(booleanOracle(true), { penalties: { not_drinking: 500 } }));
    expect(actual).toBe(0);
  });

  test('score-based activity applies the percentage-of-max formula exactly', async () => {
    const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({ sub: `e2e-oracle-${uniqueId}`, name: 'E2E Oracle Admin', groups: ['admin'] });
    const order = Math.floor(Math.random() * 100_000) + 1;
    const checkpoint = await apiCall<{ id: number }>('POST', '/checkpoint/', {
      token: admin.accessToken,
      body: { name: `E2E Oracle Checkpoint ${order}`, order, arrival_radius_m: 50 },
    });
    const activity = await apiCall<{ id: number }>('POST', '/activities/', {
      token: admin.accessToken,
      body: {
        name: 'E2E Score Activity',
        activity_type: 'ScoreBasedActivity',
        checkpoint_id: checkpoint.id,
        config: { max_points: 100, base_score: 50 },
        is_active: true,
      },
    });
    const team = await apiCall<{ id: number; access_code: string }>('POST', '/team/', {
      token: admin.accessToken,
      body: { name: `E2E Oracle Team ${order}` },
    });

    await apiCall('POST', '/checkpoint/staff-check-in', {
      token: admin.accessToken,
      body: { team_code: team.access_code, checkpoint_id: checkpoint.id },
    });
    await apiCall('POST', `/staff/teams/${team.id}/activities/${activity.id}/evaluate`, {
      token: admin.accessToken,
      body: { result_data: { achieved_points: 75 }, extra_shots: 0, penalties: {} },
    });

    const results = await apiCall<{ final_score: number }[]>(
      'GET',
      `/staff/teams/${team.id}/activities`,
      { token: admin.accessToken },
    );
    const actual = results.find((r) => (r as unknown as { activity_id: number }).activity_id === activity.id)!
      .final_score;

    expect(actual).toBe(scoreBasedOracle(75, 100, 50));
  });
});
