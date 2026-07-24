import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";
import { createAndActivateEvent } from "./seedRally";

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
    const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: { name: `E2E Mega Posto ${runId}-${i}`, order, arrival_radius_m: 9999 },
    });
    const activity = await apiCall<{ id: number }>("POST", "/activities/", {
      token: admin.accessToken,
      body: {
        name: `E2E Mega Atividade ${runId}-${i}`,
        activity_type: "BooleanActivity",
        checkpoint_id: checkpoint.id,
        config: {},
        is_active: true,
      },
    });
    checkpoints.push({
      id: checkpoint.id,
      name: `E2E Mega Posto ${runId}-${i}`,
      order,
      activityId: activity.id,
    });
  }

  const staff: MegaStaff[] = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const staffSub = `e2e-mega-staff-${runId}-${i}`;
    const staffEmail = `${staffSub}@ua.pt`;
    const staffUser = await mintToken({
      sub: staffSub,
      name: `E2E Mega Staff ${i}`,
      groups: ["rally-staff"],
      email: staffEmail,
    });
    await apiCall("GET", "/profile/me", { token: staffUser.accessToken });
    const [localUser] = await apiCall<{ id: number }[]>(
      "GET",
      `/user/search?q=${encodeURIComponent(staffEmail)}`,
      { token: admin.accessToken },
    );
    if (!localUser?.id) {
      throw new Error(`seedMegaRallyDay: could not resolve local user id for staff sub ${staffSub}`);
    }
    await apiCall("PUT", `/user/${localUser.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpoints[i].id },
    });
    staff.push({ user: staffUser, checkpointId: checkpoints[i].id });
  }

  const guideSub = `e2e-mega-guide-${runId}`;
  const guideEmail = `${guideSub}@ua.pt`;
  const guide = await mintToken({
    sub: guideSub,
    name: "E2E Mega Guide",
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
    throw new Error(`seedMegaRallyDay: could not resolve local user id for guide sub ${guideSub}`);
  }
  await apiCall("PUT", `/user/${guideLocalUser.id}/guide-checkpoint-assignment`, {
    token: admin.accessToken,
    body: { checkpoint_id: checkpoints[0].id },
  });

  await apiCall("POST", `/checkpoint/${checkpoints[0].id}/guide-indications`, {
    token: admin.accessToken,
    body: {
      hint: `Aponta para a estátua ${runId}`,
      question: "Quem é o santo padroeiro?",
      expected_answer: `Resposta secreta ${runId}`,
      order: 1,
    },
  });

  const badgeDefinition = await apiCall<{ id: number }>("POST", "/badge-definitions", {
    token: admin.accessToken,
    body: {
      code: `e2e_mega_first_checkpoint_${runId.replace(/-/g, "_")}`,
      name: `E2E Mega Primeiro Posto ${runId}`,
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
  const teamCount = 5;
  const requiredCap = existingTeams.length + teamCount + 5;

  const teams: MegaTeam[] = [];
  for (let i = 0; i < teamCount; i++) {
    const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name: `E2E Mega Equipa ${runId}-${i}` },
    });
    teams.push({ id: team.id, name: `E2E Mega Equipa ${runId}-${i}`, accessCode: team.access_code });
  }

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
      public_access_enabled: true,
      guide_mode_enabled: true,
      guide_mode_active: true,
      badges_enabled: true,
    },
  });

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
