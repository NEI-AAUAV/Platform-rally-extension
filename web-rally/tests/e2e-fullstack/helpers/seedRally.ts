import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

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

  // `order` must be unique per checkpoint AND, separately, staff-check-in
  // (api-rally's checkin.py) only advances a team past a checkpoint when
  // `checkpoint.order === len(team.times) + 1` — i.e. real progression
  // strictly requires order to start at 1 and be sequential. A random order
  // (the previous approach here) satisfies uniqueness but silently breaks
  // that invariant: staff-check-in never fires, team.times never advances,
  // and every endpoint that resolves "the team's current checkpoint" from
  // order arithmetic (see get_team_activities_for_evaluation) 404s.
  //
  // Mirrors seedRallyDay.ts's fix for the same constraint: read the highest
  // existing order in the (shared, disposable, never-reset) smoke Postgres
  // and claim the next one, retrying past collisions from other specs
  // concurrently seeding against the same event.
  async function createCheckpointWithRetry(): Promise<{ id: number; order: number }> {
    const existingCheckpoints = await apiCall<{ order: number }[]>("GET", "/checkpoint/", {
      token: admin.accessToken,
    });
    let order = existingCheckpoints.reduce((max, c) => Math.max(max, c.order), 0) + 1;
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await apiCall<{ id: number }>("POST", "/checkpoint/", {
          token: admin.accessToken,
          body: { name: `E2E Checkpoint ${order}`, order, arrival_radius_m: 50 },
        });
        return { id: created.id, order };
      } catch (error) {
        if (attempt === 49 || !(error instanceof Error) || !error.message.includes("already exists")) throw error;
        order += 1;
      }
    }
  }
  const checkpoint = await createCheckpointWithRetry();
  const order = checkpoint.order;

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
