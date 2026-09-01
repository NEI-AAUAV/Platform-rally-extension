import { test, expect } from "@playwright/test";
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
 * Running the event rather than scoring it: telling everyone something, and
 * settling the judgements that could not be made at the post.
 *
 * Both were mocked-only. Push in particular is worth checking against the real
 * backend precisely because it is *not* configured there: a feature that
 * depends on deploy-time keys must fail closed and consistently, and the easy
 * bug is one endpoint of five that forgot the guard and half-works.
 */

interface OpsWorld {
  readonly admin: MintedUser;
  readonly adminToken: string;
  readonly staffToken: string;
  readonly checkpointId: number;
  readonly checkpointName: string;
  readonly activityId: number;
  readonly teams: readonly { id: number; name: string }[];
  readonly runId: string;
}

async function seedOps(): Promise<OpsWorld> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({
    sub: `e2e-ops-admin-${runId}`,
    name: "E2E Ops Admin",
    groups: ["admin"],
    email: `e2e-ops-admin-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, "ops");

  const checkpointName = `E2E Ops Posto ${runId}`;
  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: checkpointName, order: 1, arrival_radius_m: 9999 },
  });
  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: `E2E Ops Prova ${runId}`,
      activity_type: "DeferredJudgedActivity",
      checkpoint_id: checkpoint.id,
      config: { min_points: 10, max_points: 90 },
      is_active: true,
    },
  });

  await ensureTeamCapacityAndSettings(admin, 4, {});

  const teams: { id: number; name: string }[] = [];
  for (const label of ["A", "B"]) {
    const name = `E2E Ops Equipa ${label} ${runId}`;
    const created = await apiCall<{ id: number }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name },
    });
    teams.push({ id: created.id, name });
  }

  const staff = await mintStaffAssignedToCheckpoint(runId, "-ops", "ops", admin, checkpoint.id);

  return {
    admin,
    adminToken: admin.accessToken,
    staffToken: staff.accessToken,
    checkpointId: checkpoint.id,
    checkpointName,
    activityId: activity.id,
    teams,
    runId,
  };
}

async function capture(world: OpsWorld, teamId: number): Promise<number> {
  const response = await fetch(
    `${API_V1}/activities/deferred/${world.activityId}/capture?team_id=${teamId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${world.staffToken}` },
      body: new FormData(),
    },
  );
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as { id: number }).id;
}

/** Whether this stack has push keys at all. See the describe's note. */
async function vapidConfigured(token: string): Promise<boolean> {
  const key = await apiCall<{ public_key: string | null }>("GET", "/push/vapid-public-key", {
    token,
  });
  return Boolean(key.public_key);
}

test.describe("Operação — avisar toda a gente, e julgar o que ficou por julgar", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  /**
   * Push depends on a VAPID keypair set at deploy time, and the smoke stack
   * (docker-compose.smoke.yml) deliberately has none — which is the state CI
   * runs in, so it is the state worth asserting. The tests below branch on
   * whether keys are present so that a stack which *does* configure them gets
   * the stronger assertions instead of being skipped.
   */
  test("with no VAPID keypair, every sending endpoint fails closed the same way", async () => {
    const world = await seedOps();
    test.skip(await vapidConfigured(world.adminToken), "this stack has push configured");

    const key = await apiCall<{ public_key: string | null }>("GET", "/push/vapid-public-key", {
      token: world.adminToken,
    });
    // The client asks for the key first and uses its absence to hide the
    // subscribe prompt — so null here is the contract, not an error.
    expect(key.public_key).toBeNull();

    const post = async (path: string, token: string, body: unknown) =>
      fetch(`${API_V1}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    // Subscribing is refused: registering a device for notifications that can
    // never be sent would leave a dead row and a user expecting messages.
    const subscribed = await post("/push/subscribe", world.adminToken, {
      endpoint: `https://example.invalid/push/${world.runId}`,
      keys: { p256dh: "BFakeKeyForTesting", auth: "fakeAuthSecret" },
    });
    expect(subscribed.status).toBe(503);

    const broadcast = await post("/push/broadcast", world.adminToken, {
      title: "Aviso",
      body: "O rally começa às 21h",
    });
    expect(broadcast.status).toBe(503);
    expect(await broadcast.text()).toContain("not configured");

    const announcement = await post("/push/checkpoint-announcement", world.staffToken, {
      body: "Este posto está com fila, venham daqui a 20 minutos",
    });
    expect(announcement.status).toBe(503);

    // Unsubscribing is the one that stays open on purpose: a device must
    // always be able to detach itself, even from a feature that is switched
    // off, and it has nothing to send in order to do so.
    const unsubscribed = await post("/push/unsubscribe", world.adminToken, {
      endpoint: `https://example.invalid/push/${world.runId}`,
    });
    expect(unsubscribed.status).toBeLessThan(400);
  });

  test("with a VAPID keypair, subscribe and send paths are configured instead of 503", async () => {
    const world = await seedOps();
    test.skip(!(await vapidConfigured(world.adminToken)), "this stack has no push configured");

    const key = await apiCall<{ public_key: string | null }>("GET", "/push/vapid-public-key", {
      token: world.adminToken,
    });
    expect(key.public_key).toBeTruthy();

    const endpoint = `https://example.invalid/push/${world.runId}`;
    const post = async (path: string, token: string, body: unknown) =>
      fetch(`${API_V1}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const subscribed = await post("/push/subscribe", world.adminToken, {
      endpoint,
      keys: { p256dh: "BFakeKeyForTesting", auth: "fakeAuthSecret" },
    });
    expect(subscribed.status, await subscribed.text()).toBe(200);

    const broadcast = await post("/push/broadcast", world.adminToken, {
      title: "Aviso",
      body: "O rally começa às 21h",
    });
    expect(broadcast.status, await broadcast.text()).toBe(200);

    const announcement = await post("/push/checkpoint-announcement", world.staffToken, {
      body: "Este posto está com fila, venham daqui a 20 minutos",
    });
    expect(announcement.status, await announcement.text()).toBe(200);

    const unsubscribed = await post("/push/unsubscribe", world.adminToken, { endpoint });
    expect(unsubscribed.status).toBeLessThan(400);
  });

  test("a broadcast is admin-only and an announcement needs a post to speak for", async () => {
    const world = await seedOps();

    // An admin with no checkpoint of their own cannot post a checkpoint
    // announcement: the post's name is stamped on server-side, so there has to
    // be a post. This is checked before the VAPID guard, which is why it holds
    // whether or not push is configured.
    const noPost = await fetch(`${API_V1}/push/checkpoint-announcement`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "sou admin e não estou em posto nenhum" }),
    });
    expect([400, 403, 503]).toContain(noPost.status);

    // Staff cannot broadcast to the whole rally — that is the admin's to send.
    const staffBroadcast = await fetch(`${API_V1}/push/broadcast`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.staffToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Aviso", body: "vou mandar isto a toda a gente" }),
    });
    expect(staffBroadcast.status).toBe(403);
  });

  test("the broadcast form tells the organizer push is not configured", async ({
    page,
    context,
  }) => {
    const world = await seedOps();
    test.skip(await vapidConfigured(world.adminToken), "this stack has push configured");
    await seedRealOidcSession(context, world.admin);

    // The screen an organizer reaches for when it starts raining. With no
    // VAPID keypair the tab does the right thing: it explains that this is a
    // deploy-time setting rather than an admin switch, and offers no compose
    // form at all — better than a form that appears to send. A notification
    // everybody believes went out and nobody received is worse than a visible
    // refusal.
    await page.goto("/rally/admin?tab=notifications");
    await expect(page.getByText(/Sem chave VAPID configurada/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder("Ex: Atenção equipas!")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Enviar a todas as equipas/ })).toHaveCount(0);
  });

  test("the judge orders the captures on screen, and the scores follow that order", async ({
    page,
    context,
  }) => {
    const world = await seedOps();
    await seedRealOidcSession(context, world.admin);
    const [teamA, teamB] = world.teams;
    await capture(world, teamA!.id);
    await capture(world, teamB!.id);

    // "Mais criativo" is decided by putting the teams in an order, not by
    // typing a number — so the tab is a list with arrows and one confirm.
    await page.goto("/rally/admin?tab=judging");
    // Scoped to this run's activity: the shared disposable Postgres keeps
    // every previous run's unjudged captures, and the tab groups them by
    // activity, so an unscoped locator picks up other groups' rows.
    // Walk up from this run's own team row to the nearest ancestor that also
    // holds a "Confirmar ordenação" — that is the group card for this
    // activity. Structural filters do not work here: `hasText` matches every
    // ancestor, and `filter({has})` + `.last()` picks the last in DOM order
    // rather than the innermost, both of which land on a container holding
    // every group at once. The shared disposable Postgres keeps every previous
    // run's unjudged captures, so there are always many.
    const group = page.locator(
      // normalize-space(.) rather than (text()): React renders
      // `Equipa #{id}` as two text nodes, so text() sees only "Equipa #".
      `xpath=//*[normalize-space(.)="Equipa #${teamA!.id}"]` +
        // The group root is an <li>, not a div — the rows inside it are
        // <li> too, but a row holds no confirm button, so the predicate
        // picks the card.
        `/ancestor::li[.//button[normalize-space()="Confirmar ordenação"]][1]`,
    );
    await expect(group.getByText(`Equipa #${teamA!.id}`)).toBeVisible({ timeout: 30_000 });

    // Promote whoever is last, which is never the row whose up-arrow is
    // disabled — the final order is then one the judge chose rather than the
    // one the captures arrived in.
    const upArrows = group.getByRole("button", { name: /^Subir equipa #/ });
    await upArrows.last().click();
    await group.getByRole("button", { name: "Confirmar ordenação" }).click();

    await expect
      .poll(
        async () => {
          const results = await apiCall<{ team_id: number; final_score: number | null }[]>(
            "GET",
            `/activities/deferred/${world.activityId}/results`,
            { token: world.adminToken },
          );
          const a = results.find((r) => r.team_id === teamA!.id)?.final_score;
          const b = results.find((r) => r.team_id === teamB!.id)?.final_score;
          // Both scored, and not equally: a ranking that gave everyone the
          // same number would not be a ranking.
          return a != null && b != null ? a !== b : null;
        },
        { timeout: 30_000 },
      )
      .toBe(true);

    // And nothing is left waiting: confirming an order judges every capture in
    // it, so the queue a judge works through actually empties.
    const stillPending = await apiCall<{ team_id: number }[]>(
      "GET",
      "/activities/deferred/pending",
      { token: world.adminToken },
    );
    expect(stillPending.some((r) => r.team_id === teamA!.id || r.team_id === teamB!.id)).toBe(
      false,
    );
  });

  test("a captured attempt waits unscored until a judge gives it a number", async () => {
    const world = await seedOps();
    const [teamA] = world.teams;
    const resultId = await capture(world, teamA!.id);

    const pending = await apiCall<
      { id: number; judgment_status: string | null; final_score: number | null; is_completed: boolean }[]
    >("GET", "/activities/deferred/pending", { token: world.adminToken });
    const mine = pending.find((r) => r.id === resultId);
    expect(mine, "the capture is not waiting to be judged").toBeDefined();
    expect(mine!.judgment_status).toBe("pending_judgment");
    // No score yet — which is what keeps it out of the standings, since the
    // ranking only sums results that have one.
    expect(mine!.final_score).toBeNull();
    // `is_completed` is already true here, and deliberately: it records that
    // the team *did* the challenge, not that anyone has scored it. The two are
    // separate, and conflating them is the easy mistake — the thing that means
    // "still to judge" is judgment_status.
    expect(mine!.is_completed).toBe(true);

    // Nothing has reached the team's total from an unjudged capture.
    const beforeJudging = await apiCall<{ total: number }>("GET", `/team/${teamA!.id}`, {
      token: world.adminToken,
    });
    expect(beforeJudging.total).toBe(0);

    // Judged by hand, with a number the judge chose — the other half of the
    // deferred feature from the ranking path peddy-paper-aveiro.spec.ts covers.
    const judged = await apiCall<{ id: number; final_score: number | null; is_completed: boolean }>(
      "PUT",
      `/activities/results/${resultId}/judge`,
      { token: world.adminToken, body: { points: 72, notes: "grande discurso" } },
    );
    expect(judged.final_score).toBe(72);
    expect(judged.is_completed).toBe(true);

    // It leaves the queue once decided, so a judge working through a backlog
    // never sees it twice.
    const afterJudging = await apiCall<{ id: number }[]>(
      "GET",
      "/activities/deferred/pending",
      { token: world.adminToken },
    );
    expect(afterJudging.some((r) => r.id === resultId)).toBe(false);

    // And it reaches the team's total like any other score.
    await expect
      .poll(
        async () =>
          (
            await apiCall<{ total: number }>("GET", `/team/${teamA!.id}`, {
              token: world.adminToken,
            })
          ).total,
        { timeout: 20_000 },
      )
      .toBe(72);
  });

  test("judging is the admin's, not the staff's, even at their own post", async () => {
    const world = await seedOps();
    const [teamA] = world.teams;
    const resultId = await capture(world, teamA!.id);

    // The staff member captured this one, at their own checkpoint, and still
    // cannot score it. That is the point of deferring: "mais criativo" is only
    // decidable once every team's attempt is in, which nobody at a post can
    // know.
    const asStaff = await fetch(`${API_V1}/activities/results/${resultId}/judge`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${world.staffToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ points: 90 }),
    });
    expect(asStaff.status).toBe(403);

    const stillPending = await apiCall<{ id: number }[]>(
      "GET",
      "/activities/deferred/pending",
      { token: world.adminToken },
    );
    expect(stillPending.some((r) => r.id === resultId)).toBe(true);
  });

  test("a team photo cannot be pointed at a URL the team never submitted", async () => {
    const world = await seedOps();
    const [teamA] = world.teams;
    const resultId = await capture(world, teamA!.id);

    const promote = async (imageUrl: string) =>
      fetch(`${API_V1}/activities/results/${resultId}/set-team-photo`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${world.staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_url: imageUrl }),
      });

    // Off by default: promoting an activity photo to the team's official one
    // is a capability an admin opts into event-wide.
    const whileDisabled = await promote("https://example.invalid/whatever.jpg");
    expect(whileDisabled.status).toBe(403);

    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: world.adminToken,
    });
    await apiCall("PUT", "/rally/settings", {
      token: world.adminToken,
      body: { ...settings, allow_photo_as_team_photo: true },
    });

    // Even switched on, the URL has to be one of this result's own stored
    // photos — otherwise a staff member could point a team's picture at
    // anything on the internet. This capture has no photos at all (the smoke
    // stack has no object storage), so every URL is a foreign one.
    await expect
      .poll(async () => (await promote("https://example.invalid/whatever.jpg")).status, {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(400);

    const team = await apiCall<{ photo_url: string | null }>("GET", `/team/${teamA!.id}`, {
      token: world.adminToken,
    });
    expect(team.photo_url ?? "").not.toContain("example.invalid");
  });

  test("a capture needs a team, and the activity has to be a deferred one", async () => {
    const world = await seedOps();

    const noTeam = await fetch(`${API_V1}/activities/deferred/${world.activityId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${world.staffToken}` },
      body: new FormData(),
    });
    expect(noTeam.status).toBe(400);

    // A boolean activity is scored on the spot; capturing against it would
    // quietly create a result nobody ever judges.
    const boolean = await apiCall<{ id: number }>("POST", "/activities/", {
      token: world.adminToken,
      body: {
        name: `E2E Ops Booleana ${world.runId}`,
        activity_type: "BooleanActivity",
        checkpoint_id: world.checkpointId,
        config: {},
        is_active: true,
      },
    });
    const wrongType = await fetch(
      `${API_V1}/activities/deferred/${boolean.id}/capture?team_id=${world.teams[0]!.id}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${world.staffToken}` },
        body: new FormData(),
      },
    );
    expect(wrongType.status).toBe(400);
    expect(await wrongType.text()).toContain("deferred");
  });
});
