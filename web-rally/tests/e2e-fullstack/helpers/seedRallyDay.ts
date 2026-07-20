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
 * Rejection-sampled random int in [1, max] — avoids CodeQL's biased-modulo
 * finding on crypto-sourced randomness (mirrors seedRally.ts's approach).
 */
function randomOrder(max = 100_000): number {
  const threshold = Math.floor(0x1_0000_0000 / max) * max;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= threshold);
  return (value % max) + 1;
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

  const checkpoints: SeededCheckpoint[] = [];
  for (let i = 0; i < options.checkpointCount; i++) {
    const order = randomOrder();
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
    checkpoints.push({ id: checkpoint.id, name: `E2E Posto ${runId}-${i}`, order, activityId: activity.id });
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
