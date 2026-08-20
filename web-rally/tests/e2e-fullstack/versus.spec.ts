import { test, expect } from "@playwright/test";
import { mintToken, seedRealOidcSession, apiCall, API_V1 } from "./helpers/fullstackAuth";
import { createAndActivateEvent, waitForApi } from "./helpers/seedRally";
import {
  ensureTeamCapacityAndSettings,
  mintStaffAssignedToCheckpoint,
} from "./helpers/seedGuideScenarioShared";

/**
 * Head-to-head: the format where a post is not a challenge a team does alone
 * but a match against another team.
 *
 * Covered only by the mocked suite until now, which means the pairing rules
 * and the three-tier scoring were being asserted against fixtures rather than
 * against the real engine. Both are easy to get subtly wrong: a pair is a
 * mutual relationship (pairing A with B has to make B's opponent A, not just
 * A's opponent B), and a TeamVsActivity's score is base + completion +
 * outcome, three separate numbers that a mock will happily add up however the
 * fixture author expected rather than however `TeamVsActivity` does.
 */

const BASE_POINTS = 10;
const COMPLETION_POINTS = 20;
const WIN_POINTS = 100;
const DRAW_POINTS = 50;
const LOSE_POINTS = 0;

interface VersusWorld {
  readonly adminToken: string;
  readonly staffToken: string;
  readonly checkpointId: number;
  readonly activityId: number;
  readonly teams: readonly { id: number; name: string }[];
}

async function seedVersus(): Promise<VersusWorld> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({
    sub: `e2e-versus-admin-${runId}`,
    name: "E2E Versus Admin",
    groups: ["admin"],
    email: `e2e-versus-admin-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, "versus");

  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: `E2E Arena ${runId}`, order: 1, arrival_radius_m: 9999 },
  });

  // Every tier priced differently, so a score can only come out right if all
  // three were applied — equal values would hide a dropped or doubled tier.
  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: `E2E Cabo de Guerra ${runId}`,
      activity_type: "TeamVsActivity",
      checkpoint_id: checkpoint.id,
      config: {
        base_points: BASE_POINTS,
        completion_points: COMPLETION_POINTS,
        win_points: WIN_POINTS,
        draw_points: DRAW_POINTS,
        lose_points: LOSE_POINTS,
      },
      is_active: true,
    },
  });

  await ensureTeamCapacityAndSettings(admin, 6, { enable_versus: true });

  const teams: { id: number; name: string }[] = [];
  for (const label of ["A", "B", "C", "D"]) {
    const name = `E2E Versus ${label} ${runId}`;
    const created = await apiCall<{ id: number }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name },
    });
    teams.push({ id: created.id, name });
  }

  const staff = await mintStaffAssignedToCheckpoint(runId, "-vs", "versus", admin, checkpoint.id);

  return {
    adminToken: admin.accessToken,
    staffToken: staff.accessToken,
    checkpointId: checkpoint.id,
    activityId: activity.id,
    teams,
  };
}

test.describe("Versus — equipa contra equipa, contra o backend real", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("pairing is mutual and listed, and re-pairing a paired team is refused rather than orphaning its opponent", async () => {
    const world = await seedVersus();
    const [teamA, teamB, teamC] = world.teams;

    const pair = await apiCall<{ group_id: number; team_a_id: number; team_b_id: number }>(
      "POST",
      "/versus/pair",
      { token: world.adminToken, body: { team_a_id: teamA!.id, team_b_id: teamB!.id } },
    );
    expect(pair.group_id).toBeGreaterThan(0);

    // The property a mocked test cannot check: the relationship is mutual.
    // A fixture that returns B for A says nothing about what A returns for B.
    const opponentOfA = await apiCall<{ opponent_id: number | null; opponent_name: string | null }>(
      "GET",
      `/versus/team/${teamA!.id}/opponent`,
      { token: world.adminToken },
    );
    const opponentOfB = await apiCall<{ opponent_id: number | null }>(
      "GET",
      `/versus/team/${teamB!.id}/opponent`,
      { token: world.adminToken },
    );
    expect(opponentOfA.opponent_id).toBe(teamB!.id);
    expect(opponentOfA.opponent_name).toBe(teamB!.name);
    expect(opponentOfB.opponent_id).toBe(teamA!.id);

    const groups = await apiCall<{ groups: { team_a_id: number; team_b_id: number }[] }>(
      "GET",
      "/versus/groups",
      { token: world.adminToken },
    );
    expect(
      groups.groups.some(
        (g) =>
          (g.team_a_id === teamA!.id && g.team_b_id === teamB!.id) ||
          (g.team_a_id === teamB!.id && g.team_b_id === teamA!.id),
      ),
    ).toBe(true);

    // Re-pairing an already-paired team is refused rather than silently
    // moving it. That is the safer of the two designs and worth pinning: the
    // alternative would orphan B, leaving two teams turning up at a post
    // expecting each other.
    const rePair = await fetch(`${API_V1}/versus/pair`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ team_a_id: teamA!.id, team_b_id: teamC!.id }),
    });
    expect(rePair.status).toBe(400);
    expect(await rePair.text()).toContain("already in a versus group");

    // The original pair is untouched by the rejected call — both halves of it.
    const opponentOfAAfter = await apiCall<{ opponent_id: number | null }>(
      "GET",
      `/versus/team/${teamA!.id}/opponent`,
      { token: world.adminToken },
    );
    expect(opponentOfAAfter.opponent_id).toBe(teamB!.id);
    const opponentOfBAfter = await apiCall<{ opponent_id: number | null }>(
      "GET",
      `/versus/team/${teamB!.id}/opponent`,
      { token: world.adminToken },
    );
    expect(opponentOfBAfter.opponent_id).toBe(teamA!.id);
    // And C, never paired, is still free.
    const opponentOfC = await apiCall<{ opponent_id: number | null }>(
      "GET",
      `/versus/team/${teamC!.id}/opponent`,
      { token: world.adminToken },
    );
    expect(opponentOfC.opponent_id).toBeNull();
  });

  test("an unpaired team has no opponent, and a team cannot be matched against itself", async () => {
    const world = await seedVersus();
    const [teamA] = world.teams;

    const lonely = await apiCall<{ opponent_id: number | null; opponent_name: string | null }>(
      "GET",
      `/versus/team/${teamA!.id}/opponent`,
      { token: world.adminToken },
    );
    expect(lonely.opponent_id).toBeNull();
    expect(lonely.opponent_name).toBeNull();

    const selfPair = await fetch(`${API_V1}/versus/pair`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ team_a_id: teamA!.id, team_b_id: teamA!.id }),
    });
    // Whatever the backend decides here, it must not end up as a team whose
    // opponent is itself — that is a match nobody can lose.
    if (selfPair.ok) {
      const opponent = await apiCall<{ opponent_id: number | null }>(
        "GET",
        `/versus/team/${teamA!.id}/opponent`,
        { token: world.adminToken },
      );
      expect(opponent.opponent_id).not.toBe(teamA!.id);
    } else {
      expect(selfPair.status).toBeGreaterThanOrEqual(400);
    }
  });

  test("a decided match scores both sides in one write: base + completion + outcome", async () => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    // One call settles the match for both teams — which is the point of the
    // endpoint, and the thing that can silently score only the winner.
    const settle = await fetch(
      `${API_V1}/activities/team-vs/${world.activityId}` +
        `?team1_id=${teamA!.id}&team2_id=${teamB!.id}&winner_id=${teamA!.id}`,
      {
        method: "POST",
        headers: {
          // Admin, not staff — see "the staff member running the match
          // cannot record it" below. This is the only token that works.
          Authorization: `Bearer ${world.adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: true, notes: "cabo de guerra, 2-0" }),
      },
    );
    expect(settle.status, await settle.text()).toBe(200);

    const evaluations = await apiCall<{
      evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
    }>("GET", "/staff/all-evaluations", { token: world.adminToken });
    const scoreOf = (teamId: number) =>
      evaluations.evaluations.find(
        (e) => e.team_id === teamId && e.activity_id === world.activityId,
      )?.final_score;

    // Both sides scored, not just the winner, and each by its own three tiers.
    expect(scoreOf(teamA!.id)).toBe(BASE_POINTS + COMPLETION_POINTS + WIN_POINTS);
    expect(scoreOf(teamB!.id)).toBe(BASE_POINTS + COMPLETION_POINTS + LOSE_POINTS);
  });

  test("a draw pays both teams the draw tier, which is neither a win nor a loss", async () => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    // winner_id 0 is the documented "draw" sentinel.
    const settle = await fetch(
      `${API_V1}/activities/team-vs/${world.activityId}` +
        `?team1_id=${teamA!.id}&team2_id=${teamB!.id}&winner_id=0`,
      {
        method: "POST",
        headers: {
          // Admin, not staff — see "the staff member running the match
          // cannot record it" below. This is the only token that works.
          Authorization: `Bearer ${world.adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: true }),
      },
    );
    expect(settle.status, await settle.text()).toBe(200);

    const evaluations = await apiCall<{
      evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
    }>("GET", "/staff/all-evaluations", { token: world.adminToken });
    const scoreOf = (teamId: number) =>
      evaluations.evaluations.find(
        (e) => e.team_id === teamId && e.activity_id === world.activityId,
      )?.final_score;

    const expected = BASE_POINTS + COMPLETION_POINTS + DRAW_POINTS;
    expect(scoreOf(teamA!.id)).toBe(expected);
    expect(scoreOf(teamB!.id)).toBe(expected);
    expect(expected).toBeLessThan(BASE_POINTS + COMPLETION_POINTS + WIN_POINTS);
    expect(expected).toBeGreaterThan(BASE_POINTS + COMPLETION_POINTS + LOSE_POINTS);
  });

  test("the staff member running the match cannot record it — only an admin can", async () => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    // Pinned deliberately, because it is a product gap rather than a rule:
    // `POST /activities/team-vs/{id}` guards with `require(CREATE_ACTIVITY_RESULT,
    // ...)`, whose dependency passes no checkpoint context (see abac_deps.require's
    // own docstring: endpoints needing context are supposed to call
    // require_permission inside the body). The staff rule for that action is
    // `_staff_own_checkpoint`, which is false whenever checkpoint_id is None —
    // so *every* rally-staff member is denied, including the one standing at
    // the post with the two teams in front of them. They have to call an admin
    // over to record a result they just watched.
    //
    // The same staff member can score every other activity type at that post,
    // which is what makes this look like an oversight rather than a decision.
    const asStaff = await fetch(
      `${API_V1}/activities/team-vs/${world.activityId}` +
        `?team1_id=${teamA!.id}&team2_id=${teamB!.id}&winner_id=${teamA!.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${world.staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: true }),
      },
    );
    expect(asStaff.status).toBe(403);
    expect(await asStaff.text()).toContain("create_activity_result");

    // Nothing was written by the refused call.
    const evaluations = await apiCall<{
      evaluations: { team_id: number; activity_id: number }[];
    }>("GET", "/staff/all-evaluations", { token: world.adminToken });
    expect(
      evaluations.evaluations.filter((e) => e.activity_id === world.activityId),
    ).toHaveLength(0);
  });

  test("the admin's versus page shows the real pairings", async ({ page, context }) => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    const admin = await mintToken({
      sub: `e2e-versus-viewer-${Date.now()}`,
      name: "E2E Versus Viewer",
      groups: ["admin"],
      email: `e2e-versus-viewer-${Date.now()}@ua.pt`,
    });
    await seedRealOidcSession(context, admin);

    await page.goto("/rally/versus");
    // Both halves of the pair on screen, from the real backend rather than a
    // fixture — the page is where an organizer checks who is fighting whom.
    await expect(page.getByText(teamA!.name).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(teamB!.name).first()).toBeVisible({ timeout: 30_000 });
  });
});
