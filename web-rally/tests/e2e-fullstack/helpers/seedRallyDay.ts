import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

export interface SeededCheckpoint {
  readonly id: number;
  readonly name: string;
  readonly order: number;
  readonly activityId: number;
}

export interface SeededStaff {
  readonly user: MintedUser;
  readonly checkpointId: number;
}

export interface SeededTeam {
  readonly id: number;
  readonly name: string;
  readonly accessCode: string;
}

export interface RallyDay {
  readonly admin: MintedUser;
  readonly checkpoints: readonly SeededCheckpoint[];
  readonly staff: readonly SeededStaff[];
  readonly teams: readonly SeededTeam[];
  readonly runId: string;
}

function uniqueId(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Seeds a full "day of Rally Tascas": one admin, N checkpoints (each with one
 * boolean activity and one assigned staff member), and M teams. Mirrors the
 * shape of the real event this master scenario models — multiple checkpoints
 * running concurrently, each staffed independently, with several teams
 * progressing through them at once.
 */
export async function seedRallyDay(options: {
  checkpointCount: number;
  teamCount: number;
}): Promise<RallyDay> {
  const runId = uniqueId();
  const adminSub = `e2e-day-admin-${runId}`;
  const adminEmail = `${adminSub}@ua.pt`;
  const admin = await mintToken({
    sub: adminSub,
    name: "E2E Day Admin",
    groups: ["admin"],
    email: adminEmail,
  });

  // Checkpoint order must be sequential starting at 1: the staff-evaluation
  // UI only lists a team as "to evaluate" at a checkpoint when
  // checkpoint.order - 1 === team.last_checkpoint_number, so teams that
  // haven't visited any checkpoint yet (last_checkpoint_number 0) only
  // become evaluable at an order=1 checkpoint, and only become evaluable at
  // order=2 after actually being evaluated at order=1, and so on. This
  // mirrors how a real rally's checkpoints are actually numbered — it isn't
  // an arbitrary unique id.
  //
  // The smoke Postgres accumulates checkpoints across local manual runs
  // (disposable but not cleaned between them), so order 1..N may already be
  // taken; start past the current max instead of assuming a clean slate.
  const existingCheckpoints = await apiCall<{ order: number }[]>("GET", "/checkpoint/", {
    token: admin.accessToken,
  });
  const orderBase = existingCheckpoints.reduce((max, c) => Math.max(max, c.order), 0);

  // Order values must stay consecutive across the whole batch (see comment
  // above), so a mid-batch collision can't just bump that one checkpoint —
  // it has to restart the batch from a fresh, higher base. Collisions happen
  // when another seed call in this run claims a order in the gap between
  // this GET and our POSTs; a handful of retries makes that structurally
  // negligible instead of failing the whole test outright.
  async function createCheckpointBatch(base: number): Promise<SeededCheckpoint[]> {
    const created: SeededCheckpoint[] = [];
    for (let i = 0; i < options.checkpointCount; i++) {
      const order = base + i + 1;
      const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
        token: admin.accessToken,
        body: { name: `E2E Posto ${runId}-${i}`, order, arrival_radius_m: 9999 },
      });
      const activity = await apiCall<{ id: number }>("POST", "/activities/", {
        token: admin.accessToken,
        body: {
          name: `E2E Atividade ${runId}-${i}`,
          activity_type: "BooleanActivity",
          checkpoint_id: checkpoint.id,
          config: {},
          is_active: true,
        },
      });
      created.push({ id: checkpoint.id, name: `E2E Posto ${runId}-${i}`, order, activityId: activity.id });
    }
    return created;
  }

  let checkpoints: SeededCheckpoint[] | undefined;
  for (let attempt = 0, base = orderBase; !checkpoints; attempt++) {
    try {
      checkpoints = await createCheckpointBatch(base);
    } catch (error) {
      if (attempt === 4 || !(error instanceof Error) || !error.message.includes("already exists")) throw error;
      base += 1000 * (attempt + 1);
    }
  }

  const staff: SeededStaff[] = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const staffSub = `e2e-day-staff-${runId}-${i}`;
    const staffEmail = `${staffSub}@ua.pt`;
    const staffUser = await mintToken({
      sub: staffSub,
      name: `E2E Staff ${i}`,
      groups: ["rally-staff"],
      email: staffEmail,
    });
    // Trigger local user row creation (lazy on first authenticated call).
    // /user/me only validates the token (no get_participant dependency, so
    // it never mirrors); /profile/me does depend on get_participant.
    await apiCall("GET", "/profile/me", { token: staffUser.accessToken });
    const [localUser] = await apiCall<{ id: number }[]>(
      "GET",
      `/user/search?q=${encodeURIComponent(staffEmail)}`,
      { token: admin.accessToken },
    );
    if (!localUser?.id) {
      throw new Error(`seedRallyDay: could not resolve local user id for staff sub ${staffSub}`);
    }
    await apiCall("PUT", `/user/${localUser.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpoints[i].id },
    });
    staff.push({ user: staffUser, checkpointId: checkpoints[i].id });
  }

  // The smoke Postgres is disposable but not cleaned between local manual
  // runs, so team count accumulates across sessions and can hit max_teams.
  // Raise the cap before seeding rather than assuming headroom exists.
  const settingsForCap = await apiCall<{ max_teams: number } & Record<string, unknown>>(
    "GET",
    "/rally/settings",
    { token: admin.accessToken },
  );
  const existingTeams = await apiCall<unknown[]>("GET", "/team/", { token: admin.accessToken });
  const requiredCap = existingTeams.length + options.teamCount + 5;
  if (settingsForCap.max_teams < requiredCap) {
    await apiCall("PUT", "/rally/settings", {
      token: admin.accessToken,
      body: { ...settingsForCap, max_teams: requiredCap },
    });
  }

  const teams: SeededTeam[] = [];
  for (let i = 0; i < options.teamCount; i++) {
    const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name: `E2E Equipa ${runId}-${i}` },
    });
    teams.push({ id: team.id, name: `E2E Equipa ${runId}-${i}`, accessCode: team.access_code });
  }

  const currentSettings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
    token: admin.accessToken,
  });
  await apiCall("PUT", "/rally/settings", {
    token: admin.accessToken,
    body: {
      ...currentSettings,
      participant_view_enabled: true,
      show_score_mode: "competitive",
      show_live_leaderboard: true,
    },
  });

  return { admin, checkpoints, staff, teams, runId };
}
