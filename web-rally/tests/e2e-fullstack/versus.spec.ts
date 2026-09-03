import { test, expect, type Page } from "@playwright/test";
import {
  mintToken,
  seedRealOidcSession,
  apiCall,
  API_V1,
  type MintedUser,
} from "./helpers/fullstackAuth";
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
  readonly admin: MintedUser;
  readonly adminToken: string;
  readonly staff: MintedUser;
  readonly staffToken: string;
  readonly checkpointId: number;
  readonly activityId: number;
  readonly teams: readonly { id: number; name: string; accessCode: string }[];
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

  const teams: { id: number; name: string; accessCode: string }[] = [];
  for (const label of ["A", "B", "C", "D"]) {
    const name = `E2E Versus ${label} ${runId}`;
    const created = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name },
    });
    teams.push({ id: created.id, name, accessCode: created.access_code });
  }

  const staff = await mintStaffAssignedToCheckpoint(runId, "-vs", "versus", admin, checkpoint.id);

  return {
    admin,
    adminToken: admin.accessToken,
    staff,
    staffToken: staff.accessToken,
    checkpointId: checkpoint.id,
    activityId: activity.id,
    teams,
  };
}

/**
 * Pair two teams the way an organizer does: on /rally/versus, picking each
 * side from its own dropdown and pressing the button.
 *
 * The form filters team B's list by whoever is already selected as A, which is
 * the UI's own guard against a team facing itself — worth going through rather
 * than posting the pair, since that guard exists nowhere else.
 */
async function pairThroughUi(page: Page, teamAName: string, teamBName: string): Promise<void> {
  await page.goto("/rally/versus");
  await page.locator("#team-a-select").click();
  await page.getByRole("option", { name: new RegExp(escapeForRegExp(teamAName)) }).click();
  await page.locator("#team-b-select").click();
  await page.getByRole("option", { name: new RegExp(escapeForRegExp(teamBName)) }).click();
  await page.getByRole("button", { name: "Criar Par Versus" }).click();
}

/** Team names carry a run id with regex-significant characters. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Versus — equipa contra equipa, contra o backend real", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("pairing is mutual and listed, and re-pairing a paired team is refused rather than orphaning its opponent", async ({
    page,
    context,
  }) => {
    const world = await seedVersus();
    await seedRealOidcSession(context, world.admin);
    const [teamA, teamB, teamC] = world.teams;

    await pairThroughUi(page, teamA!.name, teamB!.name);
    // The pair shows up on the same page it was made on.
    await expect(page.getByText(teamA!.name).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(teamB!.name).first()).toBeVisible();

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
          // Admin here by test choice, not by necessity: the staff member
          // assigned to this post is also allowed to settle the match.
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

  test("a draw pays both teams the draw tier, which is neither a win nor a loss", async ({
    browser,
  }) => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });
    for (const team of [teamA!, teamB!]) {
      await apiCall("POST", "/checkpoint/staff-check-in", {
        token: world.staffToken,
        body: { team_code: team.accessCode, checkpoint_id: world.checkpointId },
      });
    }

    const staffContext = await browser.newContext();
    await seedRealOidcSession(staffContext, world.staff);
    const staffPage = await staffContext.newPage();

    try {
      await staffPage.goto(`/rally/staff-evaluation/checkpoint/${world.checkpointId}`);
      await staffPage.getByText(teamA!.name).first().click();
      await staffPage
        .getByRole("button", { name: /avaliar|evaluate/i })
        .first()
        .click();
      await staffPage.locator("#teamvs-result").selectOption("draw");
      await staffPage
        .getByRole("button", {
          name: /submit evaluation|submeter avaliação|atualizar avaliação/i,
        })
        .click();
      await expect(staffPage.getByText("Atividade avaliada com sucesso!").first()).toBeVisible({
        timeout: 20_000,
      });

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
    } finally {
      await staffContext.close();
    }
  });

  test("the staff member running the match records it themselves, at their own post", async () => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    // The person who watched the match settles it. This used to be a 403 for
    // every rally-staff member — the route guarded with the context-free
    // `require(...)` dependency, and the staff rule for the action
    // (`_staff_own_checkpoint`) is false whenever checkpoint_id is None — so
    // whoever was refereeing had to fetch an admin to record a result they
    // had just seen with their own eyes.
    const settle = await fetch(
      `${API_V1}/activities/team-vs/${world.activityId}` +
        `?team1_id=${teamA!.id}&team2_id=${teamB!.id}&winner_id=${teamB!.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${world.staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: true, notes: "arbitrado no posto" }),
      },
    );
    expect(settle.status, await settle.clone().text()).toBe(200);

    const evaluations = await apiCall<{
      evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
    }>("GET", "/staff/all-evaluations", { token: world.adminToken });
    const scoreOf = (teamId: number) =>
      evaluations.evaluations.find(
        (e) => e.team_id === teamId && e.activity_id === world.activityId,
      )?.final_score;
    expect(scoreOf(teamB!.id)).toBe(BASE_POINTS + COMPLETION_POINTS + WIN_POINTS);
    expect(scoreOf(teamA!.id)).toBe(BASE_POINTS + COMPLETION_POINTS + LOSE_POINTS);
  });

  test("but not at a post that is not theirs", async () => {
    // The other half of the same rule, and the reason resolving the
    // checkpoint matters rather than dropping the guard: "staff may score"
    // has to keep meaning "at their own post".
    const world = await seedVersus();
    const other = await seedVersus();
    const [teamA, teamB] = other.teams;
    await apiCall("POST", "/versus/pair", {
      token: other.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });

    // world's staff is assigned to world's arena, not to other's.
    const trespass = await fetch(
      `${API_V1}/activities/team-vs/${other.activityId}` +
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
    expect(trespass.status).toBe(403);

    const evaluations = await apiCall<{
      evaluations: { activity_id: number }[];
    }>("GET", "/staff/all-evaluations", { token: other.adminToken });
    expect(
      evaluations.evaluations.filter((e) => e.activity_id === other.activityId),
    ).toHaveLength(0);
  });

  test("staff scores the match on the real form, and the opponent gets the mirror image", async ({
    browser,
  }) => {
    const world = await seedVersus();
    const [teamA, teamB] = world.teams;
    await apiCall("POST", "/versus/pair", {
      token: world.adminToken,
      body: { team_a_id: teamA!.id, team_b_id: teamB!.id },
    });
    // Both sides have to be standing at the post before either can be scored.
    for (const team of [teamA!, teamB!]) {
      await apiCall("POST", "/checkpoint/staff-check-in", {
        token: world.staffToken,
        body: { team_code: team.accessCode, checkpoint_id: world.checkpointId },
      });
    }

    const staffContext = await browser.newContext();
    await seedRealOidcSession(staffContext, world.staff);
    const staffPage = await staffContext.newPage();

    try {
      // The form a referee actually uses. Note this is *not* the endpoint the
      // other tests in this file drive: the UI submits through the ordinary
      // evaluation route, which mirrors the outcome onto the opponent, while
      // `POST /activities/team-vs/{id}` settles both sides in one call. Two
      // paths into the same match, and only one of them has a screen.
      await staffPage.goto(`/rally/staff-evaluation/checkpoint/${world.checkpointId}`);
      await staffPage.getByText(teamA!.name).first().click();
      await staffPage
        .getByRole("button", { name: /avaliar|evaluate/i })
        .first()
        .click();
      await staffPage.locator("#teamvs-result").selectOption("win");
      await staffPage
        .getByRole("button", {
          name: /submit evaluation|submeter avaliação|atualizar avaliação/i,
        })
        .click();
      await expect(staffPage.getByText("Atividade avaliada com sucesso!").first()).toBeVisible({
        timeout: 20_000,
      });

      // The half a referee never fills in: scoring the winner has to settle
      // the loser too, or the opponent sits unscored at a match that is over.
      await expect
        .poll(
          async () => {
            const evaluations = await apiCall<{
              evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
            }>("GET", "/staff/all-evaluations", { token: world.adminToken });
            return evaluations.evaluations.find(
              (e) => e.team_id === teamB!.id && e.activity_id === world.activityId,
            )?.final_score;
          },
          { timeout: 30_000 },
        )
        // Completion counts too: the form records the challenge as done as
        // well as decided, so both sides get the participation and completion
        // tiers and only the outcome tier differs.
        .toBe(BASE_POINTS + COMPLETION_POINTS + LOSE_POINTS);

      const evaluations = await apiCall<{
        evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
      }>("GET", "/staff/all-evaluations", { token: world.adminToken });
      const winner = evaluations.evaluations.find(
        (e) => e.team_id === teamA!.id && e.activity_id === world.activityId,
      );
      expect(winner?.final_score).toBe(BASE_POINTS + COMPLETION_POINTS + WIN_POINTS);
    } finally {
      await staffContext.close();
    }
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
