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

export interface SeededGuideScenario {
  readonly admin: MintedUser;
  readonly staff: MintedUser;
  readonly guide: MintedUser;
  readonly checkpointId: number;
  readonly checkpointName: string;
  readonly activityId: number;
  readonly teamId: number;
  readonly teamName: string;
  readonly accessCode: string;
  readonly badgeDefinitionId: number;
}

/**
 * Seeds a scenario for exercising guide-mode and auto-awarded badges against
 * a real backend — neither of which any fullstack spec covers today (both
 * exist only as mocked reimplementations in tests/e2e/guide.spec.ts and
 * tests/e2e/conquistas.spec.ts, never validated against the real API).
 *
 * One checkpoint with a guide indication (hint/question/expected answer,
 * which must never reach public payloads — see security-abac.spec.ts's
 * mocked equivalent), one boolean activity there, one team, and an
 * auto-awarding badge definition on FIRST_COMPLETE_CHECKPOINT so evaluating
 * the team's activity through the real staff UI triggers a real badge award
 * the team can then see on its own /conquistas page.
 */
export async function seedGuideAndBadgesScenario(): Promise<SeededGuideScenario> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const admin = await mintToken({
    sub: `e2e-guide-admin-${runId}`,
    name: "E2E Guide Admin",
    groups: ["admin"],
    email: `e2e-guide-admin-${runId}@ua.pt`,
  });
  await createAndActivateEvent(admin, "guide");

  const checkpointName = `E2E Posto Guia ${runId}`;
  const { checkpointId, activityId } = await createCheckpointWithActivity(
    admin,
    checkpointName,
    `E2E Atividade Guia ${runId}`,
    1,
  );
  await attachGuideIndications(admin, checkpointId, runId);

  const staff = await mintStaffAssignedToCheckpoint(runId, "", "guide", admin, checkpointId);

  const badgeDefinition = await createFirstCheckpointBadgeDefinition(
    admin,
    runId,
    "e2e_first_checkpoint",
    "E2E Primeiro Posto",
  );

  const teamName = `E2E Equipa Guia ${runId}`;
  const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: teamName },
  });

  // Team is freshly created (no arrivals yet), so its current post is order
  // 1 — the same checkpoint the guide's indications live on.
  const guide = await mintGuideAssignedToTeam(runId, "guide", admin, team.id);

  await ensureTeamCapacityAndSettings(admin, 5, {});

  return {
    admin,
    staff,
    guide,
    checkpointId,
    checkpointName,
    activityId,
    teamId: team.id,
    teamName,
    accessCode: team.access_code,
    badgeDefinitionId: badgeDefinition.id,
  };
}
