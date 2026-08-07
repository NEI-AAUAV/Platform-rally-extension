import { test, expect, type BrowserContext } from "@playwright/test";
import { apiCall } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";
import { seedPeddyPaper, loginTeam, type SeededPeddyPaper } from "./helpers/seedPeddyPaper";

/**
 * The peddy-paper game loop against the real backend.
 *
 * Everything here turns on one rule the mocked suite cannot check: the
 * redaction is server-side. A mocked spec asserting "the name is not on the
 * page" proves nothing, because the fixture author decided what the payload
 * contained. These tests read the real `/checkpoint/` response and assert the
 * answer is not in it — which is the actual security property.
 */

test.describe("peddy paper", () => {
  let peddy: SeededPeddyPaper;
  let teamToken: string;

  test.beforeAll(async () => {
    await waitForApi();
    peddy = await seedPeddyPaper();
    teamToken = await loginTeam(peddy.accessCode);
  });

  /** Put a team session in the browser without spending the per-IP login
   *  rate-limit budget on the login form (see this directory's README). */
  async function seedTeamSession(context: BrowserContext): Promise<void> {
    await context.addInitScript(
      ([token, teamId, teamName]) => {
        localStorage.setItem("rally_team_token", token as string);
        localStorage.setItem(
          "rally_team_data",
          JSON.stringify({ team_id: Number(teamId), team_name: teamName }),
        );
      },
      [teamToken, String(peddy.teamId), peddy.teamName] as [string, string, string],
    );
  }

  async function standAt(context: BrowserContext, checkpointIndex: number): Promise<void> {
    const checkpoint = peddy.checkpoints[checkpointIndex]!;
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
    });
  }

  test("the event type bootstraps the mode's settings", async () => {
    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: peddy.admin.accessToken,
    });

    // Asserted rather than set by the fixture: a regression in
    // crud_rally_settings.get_or_create must fail here, not be papered over.
    expect(settings.reveal_next_checkpoint).toBe(false);
    expect(settings.gps_checkin_enabled).toBe(true);
    expect(settings.participant_view_enabled).toBe(true);
    expect(settings.hint_penalty).toBe(-10);
  });

  test("the team's checkpoint payload carries the clue and not the answer", async () => {
    const visible = await apiCall<
      { order: number; name: string; latitude: number | null; clue: string | null }[]
    >("GET", "/checkpoint/", { token: teamToken });

    const first = visible.find((cp) => cp.order === 1);
    expect(first).toBeDefined();
    // The location *is* the answer, so none of it may be in the payload.
    expect(first!.name).toBe("Posto 1");
    expect(first!.latitude).toBeNull();
    expect(JSON.stringify(visible)).not.toContain("Ponte de Ferro");
    expect(JSON.stringify(visible)).not.toContain(String(peddy.checkpoints[0]!.latitude));
    // …but the riddle is exactly what they should have.
    expect(first!.clue).toBe(peddy.checkpoints[0]!.clue);
  });

  test("/checkpoint/me is redacted too, not just the list", async () => {
    // The single-checkpoint endpoint is the obvious way around list redaction.
    const next = await apiCall<{ name: string; latitude: number | null; clue: string | null }>(
      "GET",
      "/checkpoint/me",
      { token: teamToken },
    );

    expect(next.name).toBe("Posto 1");
    expect(next.latitude).toBeNull();
    expect(next.clue).toBe(peddy.checkpoints[0]!.clue);
  });

  test("media for an unreached checkpoint is refused", async () => {
    const response = await fetch(
      `${process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003"}/api/rally/v1/checkpoint/${peddy.checkpoints[1]!.id}/media`,
      { headers: { Authorization: `Bearer ${teamToken}` } },
    );

    // Photos of the place are as strong a reveal as its coordinates.
    expect(response.status).toBe(403);
  });

  test("the team sees the riddle and no location on its own page", async ({ page, context }) => {
    await seedTeamSession(context);
    await standAt(context, 0);

    await page.goto("/rally/team-progress");

    await expect(page.getByText("Enigma")).toBeVisible();
    // The clue legitimately appears twice — the riddle panel and the route
    // item — so match the first rather than asserting a single occurrence.
    await expect(page.getByText(peddy.checkpoints[0]!.clue).first()).toBeVisible();
    await expect(page.getByText(peddy.checkpoints[0]!.name)).toHaveCount(0);
    // 6-decimal coordinates are rendered when a post is revealed; not here.
    await expect(page.getByText(/-?\d+\.\d{6}, -?\d+\.\d{6}/)).toHaveCount(0);
  });

  test("buying a hint charges the team and never leaks the answer", async ({ page, context }) => {
    await seedTeamSession(context);
    await standAt(context, 0);
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto("/rally/team-progress");
    const hintButton = page.getByRole("button", { name: /Pedir pista/ });
    await expect(hintButton).toBeVisible();
    await hintButton.click();

    // The first rung of the ladder, and its price shown to the team — the
    // DynamicAward rows carrying the charge are admin-only.
    await expect(page.getByText(peddy.hints[0]!)).toBeVisible();
    await expect(page.getByText("-10 pts").first()).toBeVisible();
    expect(await page.content()).not.toContain(peddy.expectedAnswer);

    // The charge is real: an admin can see the award it created.
    const awards = await apiCall<{ points: number; reason: string | null }[]>(
      "GET",
      `/dynamic-awards?team_id=${peddy.teamId}`,
      { token: peddy.admin.accessToken },
    );
    expect(awards.filter((a) => a.points === -10)).toHaveLength(1);
  });

  test("the ladder runs out and over-buying bills nothing", async () => {
    // Deliberately independent of how many rungs earlier tests bought: drain
    // whatever is left, then keep asking. The ladder must end, and the
    // rejected calls must not create awards.
    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";
    const buy = () =>
      fetch(`${apiBase}/api/rally/v1/checkpoint/${peddy.checkpoints[0]!.id}/hint`, {
        method: "POST",
        headers: { Authorization: `Bearer ${teamToken}` },
      });

    let exhausted = await buy();
    let guard = 0;
    while (exhausted.status === 200 && guard < peddy.hints.length + 2) {
      exhausted = await buy();
      guard += 1;
    }
    expect(exhausted.status).toBe(400);

    const before = await apiCall<{ points: number }[]>(
      "GET",
      `/dynamic-awards?team_id=${peddy.teamId}`,
      { token: peddy.admin.accessToken },
    );
    expect((await buy()).status).toBe(400);
    const after = await apiCall<{ points: number }[]>(
      "GET",
      `/dynamic-awards?team_id=${peddy.teamId}`,
      { token: peddy.admin.accessToken },
    );

    expect(after).toHaveLength(before.length);
    // One award per rung bought, never more.
    expect(after.length).toBeLessThanOrEqual(peddy.hints.length);
  });

  test("hints for a checkpoint the team has not reached are refused", async () => {
    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";
    const response = await fetch(
      `${apiBase}/api/rally/v1/checkpoint/${peddy.checkpoints[1]!.id}/hint`,
      { method: "POST", headers: { Authorization: `Bearer ${teamToken}` } },
    );

    // Otherwise a team drains the whole route's hints and pre-solves the game.
    expect(response.status).toBe(400);
  });

  test("checking in reveals the post and hands over the next riddle", async ({ page, context }) => {
    await seedTeamSession(context);
    await standAt(context, 0);
    await page.goto("/rally/team-progress");

    await page.getByRole("button", { name: "Check-in GPS" }).click();
    await expect(page.getByText(/Posto concluído|Check-in registado|Já registado/)).toBeVisible({
      timeout: 15_000,
    });

    // Reaching the post is what buys the reveal: the completed checkpoint now
    // comes back whole, and the next riddle takes its place.
    await expect
      .poll(
        async () => {
          const visible = await apiCall<{ order: number; name: string; clue: string | null }[]>(
            "GET",
            "/checkpoint/",
            { token: teamToken },
          );
          return visible.find((cp) => cp.order === 1)?.name;
        },
        { timeout: 15_000 },
      )
      .toBe(peddy.checkpoints[0]!.name);

    const next = await apiCall<{ order: number; name: string; clue: string | null }>(
      "GET",
      "/checkpoint/me",
      { token: teamToken },
    );
    expect(next.order).toBe(2);
    expect(next.name).toBe("Posto 2");
    expect(next.clue).toBe(peddy.checkpoints[1]!.clue);
  });

  test("a check-in from the wrong place is rejected with a coarse distance", async () => {
    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";
    const response = await fetch(
      `${apiBase}/api/rally/v1/checkpoint/${peddy.checkpoints[1]!.id}/arrive`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: peddy.checkpoints[0]!.latitude, longitude: -8.0 }),
      },
    );

    expect(response.status).toBe(400);
    const detail = ((await response.json()) as { detail: string }).detail;
    // A precise metre count would let a team trilaterate a post it cannot see.
    expect(detail).toMatch(/menos de|mais de/);
    expect(detail).not.toMatch(/\d{3,}\.\d/);
  });

  test("the guide sees the clue its team was given", async () => {
    const guide = await apiCall<{ name: string; clue: string | null }[]>("GET", "/guide/checkpoints", {
      token: peddy.admin.accessToken,
    });

    // Nothing is redacted for a guide — they are standing at the answer, and
    // cannot help a stuck team without knowing what it was asked.
    const first = guide.find((cp) => cp.name === peddy.checkpoints[0]!.name);
    expect(first?.clue).toBe(peddy.checkpoints[0]!.clue);
  });
});

/** Staggered starts: same route for everyone, departures spread out. */
test.describe("staggered starts", () => {
  test("a team cannot register progress before its own start time", async () => {
    await waitForApi();
    const peddy = await seedPeddyPaper();
    const teamToken = await loginTeam(peddy.accessCode);

    // Timing lives on the *event*, not the settings row: get_or_create's
    // _sync_timing_from_event overwrites rally_start_time from the event on
    // every read, so setting it through the settings PUT would be silently
    // undone. Event started a minute ago; this team leaves an hour after that.
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    await apiCall("PUT", `/events/${peddy.eventId}`, {
      token: peddy.admin.accessToken,
      body: { start_time: startedAt },
    });
    await apiCall("PUT", `/team/${peddy.teamId}`, {
      token: peddy.admin.accessToken,
      body: { name: peddy.teamName, start_offset_minutes: 60 },
    });

    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";
    const response = await fetch(
      `${apiBase}/api/rally/v1/checkpoint/${peddy.checkpoints[0]!.id}/arrive`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: peddy.checkpoints[0]!.latitude,
          longitude: peddy.checkpoints[0]!.longitude,
        }),
      },
    );

    expect(response.status).toBe(400);
    // The team is told its own start time, not the event's.
    expect(((await response.json()) as { detail: string }).detail).toMatch(/has not started/);
  });
});

/** The escape hatch and the navigation aids, against the real backend. */
test.describe("stuck teams and navigation aids", () => {
  test("a team can give up on a post it cannot solve and move on", async () => {
    await waitForApi();
    const peddy = await seedPeddyPaper();
    const teamToken = await loginTeam(peddy.accessCode);
    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";

    const before = await apiCall<{ order: number }>("GET", "/checkpoint/me", {
      token: teamToken,
    });
    expect(before.order).toBe(1);

    const skip = await fetch(
      `${apiBase}/api/rally/v1/checkpoint/${peddy.checkpoints[0]!.id}/skip`,
      { method: "POST", headers: { Authorization: `Bearer ${teamToken}` } },
    );

    expect(skip.status).toBe(200);
    // The whole point: no longer stuck on a riddle they cannot solve.
    const after = await apiCall<{ order: number; clue: string | null }>("GET", "/checkpoint/me", {
      token: teamToken,
    });
    expect(after.order).toBe(2);
    expect(after.clue).toBe(peddy.checkpoints[1]!.clue);
  });

  test("proximity answers in bands and never in coordinates", async () => {
    await waitForApi();
    const peddy = await seedPeddyPaper();
    const teamToken = await loginTeam(peddy.accessCode);
    const apiBase = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";

    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: peddy.admin.accessToken,
    });
    await apiCall("PUT", "/rally/settings", {
      token: peddy.admin.accessToken,
      body: { ...settings, proximity_enabled: true, compass_enabled: true },
    });

    const post = peddy.checkpoints[0]!;
    const read = async (latitude: number, longitude: number) => {
      const response = await fetch(
        `${apiBase}/api/rally/v1/checkpoint/${post.id}/proximity`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        },
      );
      return { status: response.status, text: await response.text() };
    };

    const far = await read(post.latitude + 0.0072, post.longitude);
    expect(far.status).toBe(200);
    expect(JSON.parse(far.text).band).toBe("menos de 2km");
    // A bearing from 800 m away would point straight at the answer.
    expect(JSON.parse(far.text).direction).toBeNull();
    // Nor may the reply carry the post's own position.
    expect(far.text).not.toContain(String(post.latitude));

    const near = await read(post.latitude - 0.0005, post.longitude);
    expect(JSON.parse(near.text).band).toBe("menos de 100m");
    // Inside the closest band the puzzle is solved; the compass finds the door.
    expect(JSON.parse(near.text).direction).toBe("N");
  });

  test("a redacted post carries a search circle it is not the centre of", async () => {
    await waitForApi();
    const peddy = await seedPeddyPaper();
    const teamToken = await loginTeam(peddy.accessCode);

    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: peddy.admin.accessToken,
    });
    await apiCall("PUT", "/rally/settings", {
      token: peddy.admin.accessToken,
      body: { ...settings, search_radius_m: 400 },
    });

    const visible = await apiCall<
      {
        order: number;
        latitude: number | null;
        search_latitude: number | null;
        search_radius_m: number | null;
      }[]
    >("GET", "/checkpoint/", { token: teamToken });

    const first = visible.find((cp) => cp.order === 1)!;
    expect(first.latitude).toBeNull();
    expect(first.search_radius_m).toBe(400);
    // Narrowing the city to a neighbourhood, not handing over the doorway.
    expect(first.search_latitude).not.toBe(peddy.checkpoints[0]!.latitude);
  });
});
