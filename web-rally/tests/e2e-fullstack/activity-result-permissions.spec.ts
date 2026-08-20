import { test, expect } from "@playwright/test";
import { mintToken, apiCall, API_V1 } from "./helpers/fullstackAuth";
import { createAndActivateEvent, waitForApi } from "./helpers/seedRally";
import {
  ensureTeamCapacityAndSettings,
  mintStaffAssignedToCheckpoint,
} from "./helpers/seedGuideScenarioShared";

/**
 * One rule, across every route that writes an activity result: **staff score
 * at their own post, and nowhere else.**
 *
 * All five of these routes used to guard with the context-free `require(...)`
 * dependency. The staff rule for these actions is `_staff_own_checkpoint`,
 * which is false whenever `checkpoint_id` is None — so the guard collapsed to
 * admins-only and denied *every* rally-staff member, including the one at the
 * post with the team in front of them. They are now guarded with the post
 * resolved from the activity, which is what lets the rule mean what it says.
 *
 * Both halves matter and are asserted for each route. Simply dropping the
 * guard would have let any staff member score any post in the event, which is
 * a worse bug than the one being fixed — so every "can" here is paired with a
 * "but not somebody else's".
 */

interface Post {
  readonly adminToken: string;
  readonly staffToken: string;
  readonly checkpointId: number;
  readonly activityId: number;
  readonly teamId: number;
}

async function seedPost(label: string): Promise<Post> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({
    sub: `e2e-perm-admin-${label}-${runId}`,
    name: "E2E Perm Admin",
    groups: ["admin"],
    email: `e2e-perm-admin-${label}-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, `perm-${label}`);

  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: `E2E Perm Posto ${label} ${runId}`, order: 1, arrival_radius_m: 9999 },
  });
  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: `E2E Perm Prova ${label} ${runId}`,
      activity_type: "BooleanActivity",
      checkpoint_id: checkpoint.id,
      config: { success_points: 100, failure_points: 0 },
      is_active: true,
    },
  });

  await ensureTeamCapacityAndSettings(admin, 4, {});
  const team = await apiCall<{ id: number }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: `E2E Perm Equipa ${label} ${runId}` },
  });

  const staff = await mintStaffAssignedToCheckpoint(
    runId,
    `-perm-${label}`,
    `perm-${label}`,
    admin,
    checkpoint.id,
  );

  return {
    adminToken: admin.accessToken,
    staffToken: staff.accessToken,
    checkpointId: checkpoint.id,
    activityId: activity.id,
    teamId: team.id,
  };
}

async function send(
  method: "POST" | "PUT",
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${API_V1}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

/** A scored result at this post, created by its own staff. */
async function createResult(post: Post, resultData: Record<string, unknown> = { success: true }) {
  const created = await send("POST", "/activities/results/", post.staffToken, {
    activity_id: post.activityId,
    team_id: post.teamId,
    result_data: resultData,
    extra_shots: 0,
    penalties: {},
  });
  expect(created.status, created.text).toBeLessThan(400);
  return JSON.parse(created.text) as { id: number };
}

test.describe("Quem pode registar uma avaliação, e onde", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("staff creates a result at their own post, and not at another's", async () => {
    const mine = await seedPost("create-a");
    const theirs = await seedPost("create-b");

    const own = await send("POST", "/activities/results/", mine.staffToken, {
      activity_id: mine.activityId,
      team_id: mine.teamId,
      result_data: { success: true },
      extra_shots: 0,
      penalties: {},
    });
    expect(own.status, own.text).toBeLessThan(400);

    const foreign = await send("POST", "/activities/results/", mine.staffToken, {
      activity_id: theirs.activityId,
      team_id: theirs.teamId,
      result_data: { success: true },
      extra_shots: 0,
      penalties: {},
    });
    expect(foreign.status).toBe(403);

    // The refused call wrote nothing.
    const evaluations = await apiCall<{ evaluations: { activity_id: number }[] }>(
      "GET",
      "/staff/all-evaluations",
      { token: theirs.adminToken },
    );
    expect(evaluations.evaluations.filter((e) => e.activity_id === theirs.activityId)).toHaveLength(
      0,
    );
  });

  test("staff corrects a result at their own post, and not at another's", async () => {
    const mine = await seedPost("update-a");
    const theirs = await seedPost("update-b");
    const ownResult = await createResult(mine);
    const foreignResult = await createResult(theirs);

    // Fixing a score they just entered wrong is the single most ordinary
    // thing a staff member does after entering one.
    const own = await send("PUT", `/activities/results/${ownResult.id}`, mine.staffToken, {
      result_data: { success: false },
    });
    expect(own.status, own.text).toBeLessThan(400);

    const foreign = await send("PUT", `/activities/results/${foreignResult.id}`, mine.staffToken, {
      result_data: { success: false },
    });
    expect(foreign.status).toBe(403);
  });

  test("staff applies extra shots at their own post, and not at another's", async () => {
    const mine = await seedPost("shots-a");
    const theirs = await seedPost("shots-b");
    const ownResult = await createResult(mine);
    const foreignResult = await createResult(theirs);

    const own = await send(
      "POST",
      `/activities/results/${ownResult.id}/extra-shots?extra_shots=2`,
      mine.staffToken,
    );
    expect(own.status, own.text).toBeLessThan(400);

    const foreign = await send(
      "POST",
      `/activities/results/${foreignResult.id}/extra-shots?extra_shots=2`,
      mine.staffToken,
    );
    expect(foreign.status).toBe(403);
  });

  test("staff applies a penalty at their own post, and not at another's", async () => {
    const mine = await seedPost("penalty-a");
    const theirs = await seedPost("penalty-b");
    const ownResult = await createResult(mine);
    const foreignResult = await createResult(theirs);

    const own = await send(
      "POST",
      `/activities/results/${ownResult.id}/penalty?penalty_type=vomit&penalty_value=1`,
      mine.staffToken,
    );
    expect(own.status, own.text).toBeLessThan(400);

    const foreign = await send(
      "POST",
      `/activities/results/${foreignResult.id}/penalty?penalty_type=vomit&penalty_value=1`,
      mine.staffToken,
    );
    expect(foreign.status).toBe(403);
  });

  test("an admin is not confined to a post, and a participant is refused everywhere", async () => {
    const post = await seedPost("scopes");

    // Admins have no checkpoint of their own and must not be caught by the
    // rule that now scopes staff — the guard resolves a post in order to
    // *narrow* staff, not to narrow everyone.
    const asAdmin = await send("POST", "/activities/results/", post.adminToken, {
      activity_id: post.activityId,
      team_id: post.teamId,
      result_data: { success: true },
      extra_shots: 0,
      penalties: {},
    });
    expect(asAdmin.status, asAdmin.text).toBeLessThan(400);

    // Someone with no rally role at all gets nowhere.
    const nobody = await mintToken({
      sub: `e2e-perm-nobody-${Date.now()}`,
      name: "E2E Perm Nobody",
      groups: [],
      email: `e2e-perm-nobody-${Date.now()}@ua.pt`,
    });
    const asNobody = await send("POST", "/activities/results/", nobody.accessToken, {
      activity_id: post.activityId,
      team_id: post.teamId,
      result_data: { success: true },
      extra_shots: 0,
      penalties: {},
    });
    expect(asNobody.status).toBeGreaterThanOrEqual(400);
  });

  test("a result for an activity that does not exist is a 404, not a permission error", async () => {
    const post = await seedPost("missing");

    // The guard resolves the activity to find its post, so a bad id must
    // still read as "no such activity" rather than as "you may not" — which
    // would send a staff member hunting for a permission problem that isn't
    // there.
    const missing = await send("POST", "/activities/results/", post.staffToken, {
      activity_id: 99_999_999,
      team_id: post.teamId,
      result_data: { success: true },
      extra_shots: 0,
      penalties: {},
    });
    expect(missing.status).toBe(404);
  });
});
