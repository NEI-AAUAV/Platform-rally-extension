import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";
import { createAndActivateEvent } from "./seedRally";

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
  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: checkpointName, order: 1, arrival_radius_m: 9999 },
  });

  await apiCall("POST", `/checkpoint/${checkpoint.id}/guide-indications`, {
    token: admin.accessToken,
    body: {
      hint: `Aponta para a estátua ${runId}`,
      question: "Quem é o santo padroeiro?",
      expected_answer: `Resposta secreta ${runId}`,
      order: 1,
    },
  });

  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: `E2E Atividade Guia ${runId}`,
      activity_type: "BooleanActivity",
      checkpoint_id: checkpoint.id,
      config: {},
      is_active: true,
    },
  });

  const staffSub = `e2e-guide-staff-${runId}`;
  const staffEmail = `${staffSub}@ua.pt`;
  const staff = await mintToken({
    sub: staffSub,
    name: "E2E Guide Staff",
    groups: ["rally-staff"],
    email: staffEmail,
  });
  await apiCall("GET", "/profile/me", { token: staff.accessToken });
  const [staffLocalUser] = await apiCall<{ id: number }[]>(
    "GET",
    `/user/search?q=${encodeURIComponent(staffEmail)}`,
    { token: admin.accessToken },
  );
  if (!staffLocalUser?.id) {
    throw new Error(`seedGuideAndBadgesScenario: could not resolve staff user for ${staffSub}`);
  }
  await apiCall("PUT", `/user/${staffLocalUser.id}/checkpoint-assignment`, {
    token: admin.accessToken,
    body: { checkpoint_id: checkpoint.id },
  });

  const guideSub = `e2e-guide-user-${runId}`;
  const guideEmail = `${guideSub}@ua.pt`;
  const guide = await mintToken({
    sub: guideSub,
    name: "E2E Guide User",
    groups: ["rally-guide"],
    email: guideEmail,
  });
  await apiCall("GET", "/profile/me", { token: guide.accessToken });
  const [guideLocalUser] = await apiCall<{ id: number }[]>(
    "GET",
    `/user/search?q=${encodeURIComponent(guideEmail)}`,
    { token: admin.accessToken },
  );
  if (!guideLocalUser?.id) {
    throw new Error(`seedGuideAndBadgesScenario: could not resolve guide user for ${guideSub}`);
  }
  await apiCall("PUT", `/user/${guideLocalUser.id}/guide-checkpoint-assignment`, {
    token: admin.accessToken,
    body: { checkpoint_id: checkpoint.id },
  });

  const badgeDefinition = await apiCall<{ id: number }>("POST", "/badge-definitions", {
    token: admin.accessToken,
    body: {
      // Badge `code` must match ^[a-z0-9_]+$ — runId's dashes aren't allowed.
      code: `e2e_first_checkpoint_${runId.replace(/-/g, "_")}`,
      name: `E2E Primeiro Posto ${runId}`,
      description: "Concluiu o primeiro checkpoint",
      is_auto: true,
      trigger_type: "first_complete_checkpoint",
      criteria: {},
    },
  });

  const settingsForCap = await apiCall<{ max_teams: number } & Record<string, unknown>>(
    "GET",
    "/rally/settings",
    { token: admin.accessToken },
  );
  const existingTeams = await apiCall<unknown[]>("GET", "/team/", { token: admin.accessToken });
  const requiredCap = existingTeams.length + 5;

  const teamName = `E2E Equipa Guia ${runId}`;
  const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: teamName },
  });

  const currentSettings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
    token: admin.accessToken,
  });
  await apiCall("PUT", "/rally/settings", {
    token: admin.accessToken,
    body: {
      ...currentSettings,
      max_teams: settingsForCap.max_teams < requiredCap ? requiredCap : settingsForCap.max_teams,
      participant_view_enabled: true,
      show_score_mode: "competitive",
      show_live_leaderboard: true,
      guide_mode_enabled: true,
      guide_mode_active: true,
      badges_enabled: true,
    },
  });

  return {
    admin,
    staff,
    guide,
    checkpointId: checkpoint.id,
    checkpointName,
    activityId: activity.id,
    teamId: team.id,
    teamName,
    accessCode: team.access_code,
    badgeDefinitionId: badgeDefinition.id,
  };
}
