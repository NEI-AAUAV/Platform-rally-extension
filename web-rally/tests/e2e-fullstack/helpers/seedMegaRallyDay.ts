import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";
import { createAndActivateEvent } from "./seedRally";
import {
  attachGuideIndications,
  createCheckpointWithActivity,
  createFirstCheckpointBadgeDefinition,
  ensureTeamCapacityAndSettings,
  mintGuideAssignedToTeam,
  mintStaffAssignedToCheckpoint,
} from "./seedGuideScenarioShared";

export interface MegaCheckpoint {
  readonly id: number;
  readonly name: string;
  readonly order: number;
  readonly activityId: number;
}

export interface MegaStaff {
  readonly user: MintedUser;
  readonly checkpointId: number;
}

export interface MegaTeam {
  readonly id: number;
  readonly name: string;
  readonly accessCode: string;
}

export interface MegaRallyDay {
  readonly admin: MintedUser;
  readonly guide: MintedUser;
  readonly eventId: number;
  readonly checkpoints: readonly MegaCheckpoint[];
  readonly staff: readonly MegaStaff[];
  readonly teams: readonly MegaTeam[];
  readonly badgeDefinitionId: number;
  readonly runId: string;
}

/**
 * Seeds the largest realistic single-day scenario in this suite: 3
 * checkpoints (each independently staffed), 5 teams progressing through them
 * at once, a guide covering one checkpoint's indications, and an
 * auto-awarding badge — everything master-rally-day.spec.ts needs to
 * combine concurrency, badges, contestation/audit, a live dynamic award, and
 * a mid-run multi-edition switch into one scenario, instead of each living in
 * its own small isolated spec the way the rest of this directory does.
 */
export async function seedMegaRallyDay(): Promise<MegaRallyDay> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({
    sub: `e2e-mega-admin-${runId}`,
    name: "E2E Mega Admin",
    groups: ["admin"],
    email: `e2e-mega-admin-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, "mega");

  const currentEvent = await apiCall<{ id: number }>("GET", "/events/current", {
    token: admin.accessToken,
  });

  const checkpointCount = 2;
  const checkpoints: MegaCheckpoint[] = [];
  for (let i = 0; i < checkpointCount; i++) {
    const order = i + 1;
    const name = `E2E Mega Posto ${runId}-${i}`;
    const { checkpointId, activityId } = await createCheckpointWithActivity(
      admin,
      name,
      `E2E Mega Atividade ${runId}-${i}`,
      order,
    );
    checkpoints.push({ id: checkpointId, name, order, activityId });
  }

  const staff: MegaStaff[] = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const staffUser = await mintStaffAssignedToCheckpoint(
      runId,
      `-${i}`,
      "mega",
      admin,
      checkpoints[i].id,
    );
    staff.push({ user: staffUser, checkpointId: checkpoints[i].id });
  }

  await attachGuideIndications(admin, checkpoints[0].id, runId);

  const badgeDefinition = await createFirstCheckpointBadgeDefinition(
    admin,
    runId,
    "e2e_mega_first_checkpoint",
    "E2E Mega Primeiro Posto",
  );

  const teamCount = 5;
  const teams: MegaTeam[] = [];
  for (let i = 0; i < teamCount; i++) {
    const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name: `E2E Mega Equipa ${runId}-${i}` },
    });
    teams.push({ id: team.id, name: `E2E Mega Equipa ${runId}-${i}`, accessCode: team.access_code });
  }

  // teams[0] is freshly created (no arrivals yet), so its current post is
  // order 1 — the same checkpoint the guide's indications live on.
  const guide = await mintGuideAssignedToTeam(runId, "mega", admin, teams[0].id);

  await ensureTeamCapacityAndSettings(admin, teamCount + 5, { public_access_enabled: true });

  return {
    admin,
    guide,
    eventId: currentEvent.id,
    checkpoints,
    staff,
    teams,
    badgeDefinitionId: badgeDefinition.id,
    runId,
  };
}
