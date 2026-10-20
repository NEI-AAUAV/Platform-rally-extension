import {
  ADMINS,
  CHECKPOINTS,
  GUIDES,
  MANAGERS,
  MEMBERS_PER_TEAM,
  STAFF_PER_CHECKPOINT,
  TEAMS,
} from "./config.js";
import { ipFor, mint, mintMany, must } from "./http.js";
import { rand, randInt } from "./rand.js";

// Posts along a line in Aveiro, ~220 m apart, so "near"/"far" GPS fixes are
// unambiguous for the geofence and proximity checks.
const ORIGIN = { lat: 40.6301, lng: -8.6578 };
const STEP = 0.002;

// One activity type per post, rotating, so every scoring path is exercised.
export const ACTIVITY_TYPES = ["BooleanActivity", "ScoreBasedActivity", "TimeBasedActivity", "GeneralActivity"];

/** Body a staff member submits for an activity of `type`. */
export function resultFor(type) {
  switch (type) {
    case "BooleanActivity":
      return { success: rand() < 0.8 };
    case "ScoreBasedActivity":
      return { achieved_points: randInt(100) };
    case "TimeBasedActivity":
      return { completion_time_seconds: 30 + randInt(300) };
    case "GeneralActivity":
      return { assigned_points: randInt(50) };
    default:
      return {};
  }
}

function userId(adminToken, email) {
  const users = must("GET", `/user/search?q=${encodeURIComponent(email)}`, { token: adminToken, ip: ipFor("seed", 0) });
  const u = (users || []).find((x) => x.email === email) || (users || [])[0];
  if (!u) throw new Error(`seed: user ${email} not mirrored`);
  return u.id;
}

/**
 * Seeds one complete event through the public API, the same way an organizer
 * would through the admin UI: a fresh current event with every participant
 * feature switched on, CHECKPOINTS posts (one activity each, plus a second
 * activity on the first post), STAFF_PER_CHECKPOINT staff per post, GUIDES
 * guides, and TEAMS teams with MEMBERS_PER_TEAM OIDC participants each.
 */
export function seedEvent() {
  const run = `${Date.now().toString(36)}${randInt(1e6).toString(36)}`;
  const seedIp = ipFor("seed", 0);

  const admins = mintMany(
    Array.from({ length: ADMINS }, (_, i) => ({ sub: `lt-${run}-admin-${i}`, groups: ["admin"], email: `lt-${run}-admin-${i}@loadtest.rally` })),
  );
  const managers = mintMany(
    Array.from({ length: MANAGERS }, (_, i) => ({ sub: `lt-${run}-mgr-${i}`, groups: ["manager-rally"], email: `lt-${run}-mgr-${i}@loadtest.rally` })),
  );
  const admin = admins[0];
  const A = { token: admin, ip: seedIp };

  // --- event + settings ------------------------------------------------------
  const event = must("POST", "/events", { ...A, body: { name: `Load test ${run}`, slug: `load-${run}`, event_type: "rally_tascas" } });
  must("POST", `/events/${event.id}/set-current`, A);
  must("PATCH", `/events/${event.id}/capabilities`, { ...A, body: { qr_arrival: true } });

  const settings = must("GET", "/rally/settings", A);
  Object.assign(settings, {
    max_teams: TEAMS + 20,
    max_members_per_team: Math.max(MEMBERS_PER_TEAM + 2, settings.max_members_per_team || 0),
    participant_view_enabled: true,
    show_live_leaderboard: true,
    show_score_mode: "competitive",
    checkpoint_order_matters: true,
    enable_staff_scoring: true,
    gps_checkin_enabled: true,
    proximity_enabled: true,
    hints_enabled: true,
    hint_penalty: -5,
    skip_enabled: true,
    skip_penalty: -20,
    guide_mode_enabled: true,
    guide_mode_active: true,
    guide_manual_arrival_enabled: true,
    badges_enabled: true,
    public_access_enabled: true,
  });
  must("PUT", "/rally/settings", { ...A, body: settings });

  // --- checkpoints + activities ---------------------------------------------
  const checkpoints = [];
  for (let i = 0; i < CHECKPOINTS; i++) {
    const lat = ORIGIN.lat + STEP * i;
    const lng = ORIGIN.lng;
    const cp = must("POST", "/checkpoint/", {
      ...A,
      body: {
        name: `LT Posto ${i + 1}`,
        order: i + 1,
        latitude: lat,
        longitude: lng,
        arrival_radius_m: 60,
        clue: `Pista para o posto ${i + 1}`,
        staff_script: "Explicar o desafio",
        challenge_brief: "Desafio de carga",
      },
    });
    const types = [ACTIVITY_TYPES[i % ACTIVITY_TYPES.length]];
    if (i === 0) types.push("BooleanActivity");
    const activities = types.map((type, j) => {
      const a = must("POST", "/activities/", {
        ...A,
        body: { name: `LT Atividade ${i + 1}.${j + 1}`, activity_type: type, checkpoint_id: cp.id, config: {}, is_active: true },
      });
      return { id: a.id, type };
    });
    checkpoints.push({ id: cp.id, order: i + 1, lat, lng, activities });
  }

  // --- staff -------------------------------------------------------------------
  const staffReqs = [];
  for (let c = 0; c < CHECKPOINTS; c++)
    for (let s = 0; s < STAFF_PER_CHECKPOINT; s++)
      staffReqs.push({ sub: `lt-${run}-staff-${c}-${s}`, groups: ["rally-staff"], email: `lt-${run}-staff-${c}-${s}@loadtest.rally`, cp: c });
  const staffTokens = mintMany(staffReqs);
  const staff = staffReqs.map((r, i) => {
    // First authenticated call mirrors the OIDC user into the local DB.
    must("GET", "/profile/me", { token: staffTokens[i], ip: seedIp });
    const id = userId(admin, r.email);
    must("PUT", `/user/${id}/checkpoint-assignment`, { ...A, body: { checkpoint_id: checkpoints[r.cp].id } });
    return { token: staffTokens[i], cp: r.cp, ip: ipFor("staff", i) };
  });

  // --- teams + members (participants) ---------------------------------------
  const teams = [];
  const memberReqs = [];
  for (let t = 0; t < TEAMS + 1; t++) {
    // The extra last team is reserved for the race scenario and never walks.
    const team = must("POST", "/team/", { ...A, body: { name: `LT Equipa ${t + 1} ${run}` } });
    const members = [];
    for (let m = 0; m < MEMBERS_PER_TEAM; m++) {
      const email = `lt-${run}-t${t}-m${m}@loadtest.rally`;
      must("POST", `/team/${team.id}/members`, { ...A, body: { name: `Participante ${t + 1}.${m + 1}`, email, is_captain: m === 0 } });
      memberReqs.push({ sub: `lt-${run}-t${t}-m${m}`, groups: [], email, name: `Participante ${t + 1}.${m + 1}` });
      members.push({ email });
    }
    teams.push({ id: team.id, code: team.access_code, members });
  }
  const memberTokens = mintMany(memberReqs);
  let k = 0;
  teams.forEach((team, t) => {
    team.members.forEach((m, j) => {
      m.token = memberTokens[k];
      m.ip = ipFor("participant", k);
      k++;
    });
    // Each team's phone logs in once with its access code (from its own IP:
    // the login limiter is per IP and per code).
    const login = must("POST", "/team-auth/login", { ip: ipFor("team", t), body: { access_code: team.code } });
    team.teamToken = login.access_token;
    team.ip = ipFor("team", t);
  });

  // --- guides (one per team, round-robin) -----------------------------------
  const guideReqs = Array.from({ length: GUIDES }, (_, i) => ({ sub: `lt-${run}-guide-${i}`, groups: ["rally-guide"], email: `lt-${run}-guide-${i}@loadtest.rally` }));
  const guideTokens = mintMany(guideReqs);
  const guides = guideReqs.map((r, i) => {
    must("GET", "/profile/me", { token: guideTokens[i], ip: seedIp });
    const id = userId(admin, r.email);
    const team = teams[i % TEAMS];
    must("PUT", `/user/${id}/guide-team-assignment`, { ...A, body: { team_id: team.id } });
    return { token: guideTokens[i], teamId: team.id, ip: ipFor("guide", i) };
  });

  const raceTeam = teams.pop();

  return {
    run,
    eventId: event.id,
    admins: admins.map((token, i) => ({ token, ip: ipFor("admin", i) })),
    managers: managers.map((token, i) => ({ token, ip: ipFor("admin", 100 + i) })),
    checkpoints,
    staff,
    guides,
    teams,
    raceTeam,
    // A token signed by the real provider but with no rally groups.
    settings,
    plainUser: mint(`lt-${run}-nobody`, []),
  };
}
