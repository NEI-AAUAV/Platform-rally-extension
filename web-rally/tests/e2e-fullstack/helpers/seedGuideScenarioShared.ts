import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

/** Resolves the local numeric user id for a freshly-minted OIDC user via email search. */
export async function resolveLocalUserId(
  admin: MintedUser,
  email: string,
  notFoundLabel: string,
): Promise<number> {
  const [localUser] = await apiCall<{ id: number }[]>(
    "GET",
    `/user/search?q=${encodeURIComponent(email)}`,
    { token: admin.accessToken },
  );
  if (!localUser?.id) {
    throw new Error(`${notFoundLabel}: could not resolve local user id`);
  }
  return localUser.id;
}

/** Creates one checkpoint with a single boolean activity attached to it. */
export async function createCheckpointWithActivity(
  admin: MintedUser,
  checkpointName: string,
  activityName: string,
  order: number,
): Promise<{ checkpointId: number; activityId: number }> {
  const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
    token: admin.accessToken,
    body: { name: checkpointName, order, arrival_radius_m: 9999 },
  });
  const activity = await apiCall<{ id: number }>("POST", "/activities/", {
    token: admin.accessToken,
    body: {
      name: activityName,
      activity_type: "BooleanActivity",
      checkpoint_id: checkpoint.id,
      config: {},
      is_active: true,
    },
  });
  return { checkpointId: checkpoint.id, activityId: activity.id };
}

/** Attaches guide indications (hint/question/expected answer) to a checkpoint. */
export async function attachGuideIndications(
  admin: MintedUser,
  checkpointId: number,
  runId: string,
): Promise<void> {
  await apiCall("POST", `/checkpoint/${checkpointId}/guide-indications`, {
    token: admin.accessToken,
    body: {
      hint: `Aponta para a estátua ${runId}`,
      question: "Quem é o santo padroeiro?",
      expected_answer: `Resposta secreta ${runId}`,
      order: 1,
    },
  });
}

/** Mints a rally-staff user and assigns them to a checkpoint. Returns the minted user. */
export async function mintStaffAssignedToCheckpoint(
  runId: string,
  suffix: string,
  label: string,
  admin: MintedUser,
  checkpointId: number,
): Promise<MintedUser> {
  const staffSub = `e2e-${label}-staff-${runId}${suffix}`;
  const staffEmail = `${staffSub}@ua.pt`;
  const staffUser = await mintToken({
    sub: staffSub,
    name: `E2E ${label} Staff${suffix}`,
    groups: ["rally-staff"],
    email: staffEmail,
  });
  await apiCall("GET", "/profile/me", { token: staffUser.accessToken });
  const localUserId = await resolveLocalUserId(admin, staffEmail, `mintStaffAssignedToCheckpoint(${staffSub})`);
  await apiCall("PUT", `/user/${localUserId}/checkpoint-assignment`, {
    token: admin.accessToken,
    body: { checkpoint_id: checkpointId },
  });
  return staffUser;
}

/** Mints a rally-guide user and assigns them to a team. Returns the minted user. */
export async function mintGuideAssignedToTeam(
  runId: string,
  label: string,
  admin: MintedUser,
  teamId: number,
): Promise<MintedUser> {
  const guideSub = `e2e-${label}-guide-${runId}`;
  const guideEmail = `${guideSub}@ua.pt`;
  const guide = await mintToken({
    sub: guideSub,
    name: `E2E ${label} Guide`,
    groups: ["rally-guide"],
    email: guideEmail,
  });
  await apiCall("GET", "/profile/me", { token: guide.accessToken });
  const localUserId = await resolveLocalUserId(admin, guideEmail, `mintGuideAssignedToTeam(${guideSub})`);
  await apiCall("PUT", `/user/${localUserId}/guide-team-assignment`, {
    token: admin.accessToken,
    body: { team_id: teamId },
  });
  return guide;
}

/** Creates an auto-awarding badge definition for FIRST_COMPLETE_CHECKPOINT. */
export async function createFirstCheckpointBadgeDefinition(
  admin: MintedUser,
  runId: string,
  codePrefix: string,
  namePrefix: string,
): Promise<{ id: number }> {
  return apiCall<{ id: number }>("POST", "/badge-definitions", {
    token: admin.accessToken,
    body: {
      // Badge `code` must match ^[a-z0-9_]+$ — runId's dashes aren't allowed.
      code: `${codePrefix}_${runId.replaceAll("-", "_")}`,
      name: `${namePrefix} ${runId}`,
      description: "Concluiu o primeiro checkpoint",
      is_auto: true,
      trigger_type: "first_complete_checkpoint",
      criteria: {},
    },
  });
}

/** Raises max_teams to fit newly-created teams and enables the settings a scenario needs. */
export async function ensureTeamCapacityAndSettings(
  admin: MintedUser,
  extraTeamsNeeded: number,
  extraSettings: Record<string, unknown>,
): Promise<void> {
  const settingsForCap = await apiCall<{ max_teams: number } & Record<string, unknown>>(
    "GET",
    "/rally/settings",
    { token: admin.accessToken },
  );
  const existingTeams = await apiCall<unknown[]>("GET", "/team/", { token: admin.accessToken });
  const requiredCap = existingTeams.length + extraTeamsNeeded;

  const currentSettings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
    token: admin.accessToken,
  });
  await apiCall("PUT", "/rally/settings", {
    token: admin.accessToken,
    body: {
      ...currentSettings,
      max_teams: Math.max(settingsForCap.max_teams, requiredCap),
      participant_view_enabled: true,
      show_score_mode: "competitive",
      show_live_leaderboard: true,
      guide_mode_enabled: true,
      guide_mode_active: true,
      badges_enabled: true,
      ...extraSettings,
    },
  });
}
