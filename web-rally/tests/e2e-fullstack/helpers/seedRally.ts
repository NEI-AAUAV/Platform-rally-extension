import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

/**
 * Checkpoint `order` is a single sequence scoped to whichever event is
 * "current" (api-rally/app/models/checkpoint.py's uq_checkpoint_event_order
 * constraint) — real rallies have exactly one ordered checkpoint list shared
 * by every team. staff-check-in only advances a team past a checkpoint when
 * `checkpoint.order === len(team.times) + 1`, so a team's *first* checkpoint
 * must be order 1 within its event.
 *
 * The smoke Postgres is disposable but not reset between spec files sharing
 * one CI job, and every seedRally()/seedRallyDay() call previously reused
 * whatever event happened to be "current" — so by the 2nd+ call in a job,
 * its checkpoint landed at some already-high global order while the fresh
 * team's own len(times) was still 0, and staff-check-in could never fire.
 * Minting and activating a fresh event per call gives each test a genuinely
 * empty checkpoint sequence to start its own order at 1, matching how real
 * rallies actually work instead of simulating several unrelated rallies
 * sharing one event's order space.
 */
export async function createAndActivateEvent(admin: MintedUser, label: string): Promise<void> {
  const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const event = await apiCall<{ id: number }>("POST", "/events", {
    token: admin.accessToken,
    body: { name: `E2E Event ${label} ${uniqueId}`, slug: `e2e-event-${label}-${uniqueId}` },
  });
  await apiCall("POST", `/events/${event.id}/set-current`, { token: admin.accessToken });
}

export interface SeededRally {
  readonly admin: MintedUser;
  readonly checkpointId: number;
  readonly checkpointOrder: number;
  readonly activityId: number;
  readonly teamId: number;
  readonly accessCode: string;
}

/**
 * Minimal deterministic fixture: one admin, one checkpoint, one boolean
 * activity, one team. Mirrors api-rally/scripts/smoke/run_smoke.py's setup
 * step so the same real-backend contract is exercised. Each call creates
 * fresh rows (no cleanup — the smoke Postgres is disposable per CI run).
 */
export async function seedRally(): Promise<SeededRally> {
  // A Date.now()-only suffix collides across fast sequential retries (same
  // millisecond), which reuses the same admin `sub` / checkpoint `order` and
  // corrupts state between retry attempts. Add a random component.
  const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const adminSub = `e2e-admin-${uniqueId}`;
  const adminEmail = `${adminSub}@ua.pt`;
  const admin = await mintToken({
    sub: adminSub,
    name: "E2E Admin",
    groups: ["admin"],
    email: adminEmail,
  });

  // Fresh event -> this call's checkpoint can genuinely be order 1 (see
  // createAndActivateEvent's comment for why that's required).
  await createAndActivateEvent(admin, "rally");

  const order = 1;
  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: `E2E Checkpoint ${order}`, order, arrival_radius_m: 50 },
  });

  // Endpoints like GET /staff/teams/{id}/activities require staff_checkpoint_id
  // even for admins (see api-rally's get_staff_with_checkpoint_access +
  // get_team_activities_for_evaluation's explicit check) — so assign the
  // admin's own mirrored user row to this checkpoint. The row is created
  // lazily on first authenticated call, which the checkpoint POST above
  // already triggered.
  const [adminUser] = await apiCall<{ id: number; authentik_sub: string }[]>(
    "GET",
    `/user/search?q=${encodeURIComponent(adminEmail)}`,
    { token: admin.accessToken },
  );
  if (!adminUser?.id) {
    throw new Error(`seedRally: could not resolve local user id for admin sub ${adminSub}`);
  }
  await apiCall("PUT", `/user/${adminUser.id}/checkpoint-assignment`, {
    token: admin.accessToken,
    body: { checkpoint_id: checkpoint.id },
  });

  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: "E2E Activity",
      activity_type: "BooleanActivity",
      checkpoint_id: checkpoint.id,
      config: {},
      is_active: true,
    },
  });

  // The smoke Postgres is disposable but not reset between spec files sharing
  // the same CI job, so team count accumulates across seedRally/seedRallyDay
  // calls and can hit max_teams. Raise the cap before seeding rather than
  // assuming headroom exists (mirrors seedRallyDay.ts's same fix).
  const settingsForCap = await apiCall<{ max_teams: number } & Record<string, unknown>>(
    "GET",
    "/rally/settings",
    { token: admin.accessToken },
  );
  const existingTeams = await apiCall<unknown[]>("GET", "/team/", { token: admin.accessToken });
  const requiredCap = existingTeams.length + 5;
  if (settingsForCap.max_teams < requiredCap) {
    await apiCall("PUT", "/rally/settings", {
      token: admin.accessToken,
      body: { ...settingsForCap, max_teams: requiredCap },
    });
  }

  const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: `E2E Team ${order}` },
  });

  // The fake-oidc smoke stack starts with participant_view_enabled: false
  // (and other conservative defaults); flip on what the golden-path scenario
  // needs to see the team's own progress view render.
  const currentSettings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
    token: admin.accessToken,
  });
  await apiCall("PUT", "/rally/settings", {
    token: admin.accessToken,
    body: { ...currentSettings, participant_view_enabled: true, show_score_mode: "competitive" },
  });

  return {
    admin,
    checkpointId: checkpoint.id,
    checkpointOrder: order,
    activityId: activity.id,
    teamId: team.id,
    accessCode: team.access_code,
  };
}

/** Polls the API's OpenAPI docs endpoint until the backend is ready. */
export async function waitForApi(timeoutMs = 60_000): Promise<void> {
  const apiBaseUrl = process.env.FULLSTACK_API_BASE_URL ?? "http://localhost:8003";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/docs`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("api-rally did not become ready in time");
}
