import { test, expect } from "@playwright/test";
import { mintToken, apiCall, API_V1 } from "./helpers/fullstackAuth";
import { createAndActivateEvent, waitForApi } from "./helpers/seedRally";
import { ensureTeamCapacityAndSettings } from "./helpers/seedGuideScenarioShared";

/**
 * Every way points move that is not a staff member scoring an activity.
 *
 * Three separate mechanisms, all previously mocked-only, and all of them
 * things an organizer reaches for mid-event:
 *
 *  - **Leg-time scoring** pays or charges a team for how long it took between
 *    two consecutive posts. It is the only scoring in the product that nobody
 *    triggers — it fires off the arrival itself — which is exactly why a
 *    mocked test cannot tell you it works.
 *  - **Dynamic rules** are the named reasons behind discretionary awards, so
 *    that "melhor claque, +50" is a rule with a price rather than a number
 *    somebody typed twice.
 *  - **Badges** awarded by hand, and the showcase board a team sees, which has
 *    a kill-switch that must actually empty the board rather than just hide
 *    the nav.
 */

interface LeverWorld {
  readonly adminToken: string;
  readonly checkpoints: readonly { id: number; order: number }[];
  readonly teamId: number;
  readonly teamName: string;
  readonly teamToken: string;
  readonly runId: string;
}

async function seedLevers(options: {
  legTime?: { target: number; perMinute: number; maxAdjustment: number };
}): Promise<LeverWorld> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({
    sub: `e2e-levers-admin-${runId}`,
    name: "E2E Levers Admin",
    groups: ["admin"],
    email: `e2e-levers-admin-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, "levers");

  // Two posts with no activity: arriving completes them outright, so the only
  // thing that can move the score is the lever under test.
  const checkpoints: { id: number; order: number }[] = [];
  for (const order of [1, 2]) {
    const created = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: {
        name: `E2E Lever Posto ${runId}-${order}`,
        order,
        latitude: 40.5 + order / 1000,
        longitude: -8.5,
        arrival_radius_m: 9999,
      },
    });
    checkpoints.push({ id: created.id, order });
  }

  await ensureTeamCapacityAndSettings(admin, 4, {
    gps_checkin_enabled: true,
    ...(options.legTime
      ? {
          leg_time_scoring_enabled: true,
          leg_time_target_minutes: options.legTime.target,
          leg_time_points_per_minute: options.legTime.perMinute,
          leg_time_max_adjustment: options.legTime.maxAdjustment,
        }
      : {}),
  });

  const teamName = `E2E Lever Equipa ${runId}`;
  const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: teamName },
  });
  const { access_token: teamToken } = await apiCall<{ access_token: string }>(
    "POST",
    "/team-auth/login",
    { body: { access_code: team.access_code } },
  );

  return {
    adminToken: admin.accessToken,
    checkpoints,
    teamId: team.id,
    teamName,
    teamToken,
    runId,
  };
}

async function arrive(teamToken: string, checkpointId: number, at: { lat: number; lng: number }) {
  const response = await fetch(`${API_V1}/checkpoint/${checkpointId}/arrive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ latitude: at.lat, longitude: at.lng }),
  });
  return { status: response.status, body: await response.text() };
}

test.describe("As alavancas de pontuação fora da avaliação", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("leg-time pays a fast leg, capped at the adjustment ceiling", async () => {
    // Target 10 minutes at 5 points a minute would pay 49-odd for a leg walked
    // in seconds; the cap is what keeps that from blowing up the board, so the
    // interesting assertion is the ceiling, not the raw arithmetic.
    const maxAdjustment = 20;
    const world = await seedLevers({
      legTime: { target: 10, perMinute: 5, maxAdjustment },
    });
    const [first, second] = world.checkpoints;

    // No leg before the first post — nothing to pay for.
    expect((await arrive(world.teamToken, first!.id, { lat: 40.501, lng: -8.5 })).status).toBe(200);
    const afterFirst = await apiCall<{ points: number; reason: string | null }[]>(
      "GET",
      `/dynamic-awards?team_id=${world.teamId}`,
      { token: world.adminToken },
    );
    expect(afterFirst).toHaveLength(0);

    // The second arrival closes a leg, seconds long, well under target.
    expect((await arrive(world.teamToken, second!.id, { lat: 40.502, lng: -8.5 })).status).toBe(200);

    await expect
      .poll(
        async () =>
          (
            await apiCall<{ points: number }[]>("GET", `/dynamic-awards?team_id=${world.teamId}`, {
              token: world.adminToken,
            })
          ).length,
        { timeout: 20_000 },
      )
      .toBe(1);

    const awards = await apiCall<{ points: number; reason: string | null }[]>(
      "GET",
      `/dynamic-awards?team_id=${world.teamId}`,
      { token: world.adminToken },
    );
    expect(awards[0]!.points).toBe(maxAdjustment);
    // The award says which leg it was for, so a disputed total can be traced.
    expect(awards[0]!.reason).toContain(String(second!.id));
  });

  test("leg-time priced at zero is inert even with the switch on", async () => {
    // The convention used everywhere in RallySettings: a cost of 0 means free,
    // not off. A feature switched on but not yet priced must do nothing rather
    // than error or award zero-point rows that clutter the audit.
    const world = await seedLevers({ legTime: { target: 10, perMinute: 0, maxAdjustment: 20 } });
    const [first, second] = world.checkpoints;

    await arrive(world.teamToken, first!.id, { lat: 40.501, lng: -8.5 });
    await arrive(world.teamToken, second!.id, { lat: 40.502, lng: -8.5 });

    const awards = await apiCall<unknown[]>("GET", `/dynamic-awards?team_id=${world.teamId}`, {
      token: world.adminToken,
    });
    expect(awards).toHaveLength(0);
  });

  test("leg-time off entirely leaves arrivals unscored", async () => {
    const world = await seedLevers({});
    const [first, second] = world.checkpoints;

    await arrive(world.teamToken, first!.id, { lat: 40.501, lng: -8.5 });
    await arrive(world.teamToken, second!.id, { lat: 40.502, lng: -8.5 });

    const awards = await apiCall<unknown[]>("GET", `/dynamic-awards?team_id=${world.teamId}`, {
      token: world.adminToken,
    });
    expect(awards).toHaveLength(0);
  });

  test("a dynamic rule is the named price behind a discretionary award", async () => {
    const world = await seedLevers({});

    const rule = await apiCall<{ id: number; name: string; points: number; is_active: boolean }>(
      "POST",
      "/dynamic-rules",
      {
        token: world.adminToken,
        body: {
          name: `Melhor claque ${world.runId}`,
          description: "A equipa que mais apoiou as outras",
          rule_type: "bonus",
          points: 50,
          is_active: true,
          is_automatic: false,
        },
      },
    );
    expect(rule.points).toBe(50);

    const listed = await apiCall<{ id: number; name: string }[]>("GET", "/dynamic-rules", {
      token: world.adminToken,
    });
    expect(listed.some((r) => r.id === rule.id)).toBe(true);

    // The award carries the rule, so the scoreboard's arithmetic can be
    // explained afterwards by pointing at a rule rather than at a memory.
    await apiCall("POST", "/dynamic-awards", {
      token: world.adminToken,
      body: {
        team_id: world.teamId,
        points: rule.points,
        reason: rule.name,
        rule_id: rule.id,
      },
    });
    await expect
      .poll(
        async () =>
          (
            await apiCall<{ total: number }>("GET", `/team/${world.teamId}`, {
              token: world.adminToken,
            })
          ).total,
        { timeout: 20_000 },
      )
      .toBe(50);

    // Repricing the rule does not silently reprice awards already handed out —
    // a team's total must not move because someone edited a rule afterwards.
    await apiCall("PUT", `/dynamic-rules/${rule.id}`, {
      token: world.adminToken,
      body: { name: rule.name, rule_type: "bonus", points: 10, is_active: true },
    });
    const stillFifty = await apiCall<{ total: number }>("GET", `/team/${world.teamId}`, {
      token: world.adminToken,
    });
    expect(stillFifty.total).toBe(50);

    // Deleting the rule is a 204 and takes it out of the list.
    const deleted = await fetch(`${API_V1}/dynamic-rules/${rule.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${world.adminToken}` },
    });
    expect(deleted.status).toBe(204);
    const afterDelete = await apiCall<{ id: number }[]>("GET", "/dynamic-rules", {
      token: world.adminToken,
    });
    expect(afterDelete.some((r) => r.id === rule.id)).toBe(false);
  });

  test("a badge awarded by hand shows as earned on the team's board", async () => {
    const world = await seedLevers({});
    const code = `e2e_lever_badge_${world.runId.replace(/-/g, "_")}`.slice(0, 60);

    const definition = await apiCall<{ id: number; code: string }>("POST", "/badge-definitions", {
      token: world.adminToken,
      body: {
        code,
        name: `Melhor Disfarce ${world.runId}`,
        description: "Dado à mão pela organização",
        is_active: true,
      },
    });
    expect(definition.code).toBe(code);

    // Before the award the badge is in the catalogue but not earned — the
    // locked half of the grid a team sees.
    const before = await apiCall<{
      definitions: { code: string }[];
      earned: { code: string }[];
    }>("GET", `/teams/${world.teamId}/badge-showcase`, { token: world.adminToken });
    expect(before.definitions.some((d) => d.code === code)).toBe(true);
    expect(before.earned.some((e) => e.code === code)).toBe(false);

    const awarded = await apiCall<{ id: number }>("POST", "/badges/award", {
      token: world.adminToken,
      body: { team_id: world.teamId, badge_code: code },
    });
    expect(awarded.id).toBeGreaterThan(0);

    const after = await apiCall<{ earned: { code: string }[] }>(
      "GET",
      `/teams/${world.teamId}/badge-showcase`,
      { token: world.adminToken },
    );
    expect(after.earned.some((e) => e.code === code)).toBe(true);

    // Revoking takes it back off the board.
    const revoked = await fetch(`${API_V1}/badges/${awarded.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${world.adminToken}` },
    });
    expect(revoked.status).toBe(204);
    const afterRevoke = await apiCall<{ earned: { code: string }[] }>(
      "GET",
      `/teams/${world.teamId}/badge-showcase`,
      { token: world.adminToken },
    );
    expect(afterRevoke.earned.some((e) => e.code === code)).toBe(false);
  });

  test("an unknown or inactive badge code is refused rather than invented", async () => {
    const world = await seedLevers({});

    const unknown = await fetch(`${API_V1}/badges/award`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: world.teamId, badge_code: "nao_existe_de_todo" }),
    });
    expect(unknown.status).toBe(404);

    const code = `e2e_inactive_${world.runId.replace(/-/g, "_")}`.slice(0, 60);
    const definition = await apiCall<{ id: number }>("POST", "/badge-definitions", {
      token: world.adminToken,
      body: { code, name: `Retirado ${world.runId}`, is_active: false },
    });
    expect(definition.id).toBeGreaterThan(0);

    const inactive = await fetch(`${API_V1}/badges/award`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: world.teamId, badge_code: code }),
    });
    expect(inactive.status).toBe(400);
    expect(await inactive.text()).toContain("inactive");
  });

  test("switching badges off empties the board, it does not merely hide the nav", async () => {
    const world = await seedLevers({});
    const code = `e2e_killswitch_${world.runId.replace(/-/g, "_")}`.slice(0, 60);
    await apiCall("POST", "/badge-definitions", {
      token: world.adminToken,
      body: { code, name: `Kill switch ${world.runId}`, is_active: true },
    });
    await apiCall("POST", "/badges/award", {
      token: world.adminToken,
      body: { team_id: world.teamId, badge_code: code },
    });

    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: world.adminToken,
    });
    await apiCall("PUT", "/rally/settings", {
      token: world.adminToken,
      body: { ...settings, badges_enabled: false },
    });

    // The point of asserting the payload rather than the page: hiding a nav
    // item is a decoration, and a direct API hit would still hand the board
    // over. With the feature off it must come back empty.
    await expect
      .poll(
        async () => {
          const board = await apiCall<{
            definitions: unknown[];
            earned: unknown[];
          }>("GET", `/teams/${world.teamId}/badge-showcase`, { token: world.adminToken });
          return board.definitions.length + board.earned.length;
        },
        { timeout: 20_000 },
      )
      .toBe(0);
  });

  test("admin metrics report real counters that only move forwards", async () => {
    const world = await seedLevers({});

    const first = await apiCall<{
      requests_total: number;
      errors_5xx: number;
      request_duration_seconds_count: number;
    }>("GET", "/admin/metrics", { token: world.adminToken });
    expect(first.requests_total).toBeGreaterThan(0);

    // Some real traffic between the two reads.
    for (let i = 0; i < 3; i++) {
      await apiCall("GET", "/team/", { token: world.adminToken });
    }

    const second = await apiCall<{
      requests_total: number;
      request_duration_seconds_count: number;
      request_duration_seconds_sum: number;
    }>("GET", "/admin/metrics", { token: world.adminToken });
    // Counters, so they only ever climb — the panel diffs successive polls to
    // derive interval latency, which a counter that resets would ruin.
    expect(second.requests_total).toBeGreaterThan(first.requests_total);
    expect(second.request_duration_seconds_count).toBeGreaterThanOrEqual(
      first.request_duration_seconds_count,
    );
    expect(second.request_duration_seconds_sum).toBeGreaterThan(0);
  });
});
