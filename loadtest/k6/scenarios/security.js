import http from "k6/http";
import encoding from "k6/encoding";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { API_V1 } from "../lib/config.js";
import { api, ipFor, json, mint, think, uuid } from "../lib/http.js";
import { rand, randInt } from "../lib/rand.js";

export const rateLimited = new Counter("rally_rate_limited_429");

let forged = null;

function b64url(s) {
  return encoding.b64encode(s, "rawurl");
}

/** Bad credentials of every kind, minted once per VU. */
function forgedTokens(data) {
  if (forged) return forged;
  const valid = data.plainUser;
  const [h, , sig] = valid.split(".");
  const adminClaims = JSON.parse(encoding.b64decode(valid.split(".")[1], "rawurl", "s"));
  adminClaims.groups = ["admin"];
  const teamParts = data.teams[0].teamToken.split(".");
  const teamClaims = JSON.parse(encoding.b64decode(teamParts[1], "rawurl", "s"));
  teamClaims.team_id = data.teams[1].id;
  forged = {
    // Real signature, payload escalated to admin.
    escalated: `${h}.${b64url(JSON.stringify(adminClaims))}.${sig}`,
    // alg=none downgrade.
    none: `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(adminClaims))}.`,
    // HS256 confusion attempt with the team secret family.
    hs256: `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(adminClaims))}.${sig}`,
    expired: mint(`lt-${data.run}-expired`, ["admin"], { expiresIn: -120 }),
    wrongAudience: mint(`lt-${data.run}-aud`, ["admin"], { audience: "some-other-app" }),
    // Team token re-pointed at another team (signature no longer matches).
    teamSwap: `${teamParts[0]}.${b64url(JSON.stringify(teamClaims))}.${teamParts[2]}`,
  };
  return forged;
}

const DENIED = [401, 403];

/**
 * Authentication and authorization under load: every forged / expired /
 * foreign token is rejected, every role is confined to its own endpoints, and
 * malformed input is answered with a 4xx, never a 5xx.
 */
export function securityProbe(data) {
  const f = forgedTokens(data);
  const ip = ipFor("security", randInt(200));
  const deny = (label, method, path, token, body, expect = DENIED) => {
    const res = api(method, path, { token, ip, body, expect, name: `SEC ${method} ${path.replace(/\d+/g, "{id}")}` });
    const ok = check(res, { [`denied: ${label}`]: (r) => expect.includes(r.status) });
    if (!ok && __ENV.DEBUG) console.warn(`denied: ${label}: got ${res.status} ${String(res.body).slice(0, 200)}`);
  };

  // --- authentication -------------------------------------------------------
  deny("no token on staff list", "GET", "/staff/teams", null, undefined, [401]);
  deny("escalated payload, original signature", "GET", "/audit", f.escalated, undefined, [401]);
  deny("alg=none token", "GET", "/audit", f.none, undefined, [401]);
  deny("HS256 alg-confusion token", "GET", "/audit", f.hs256, undefined, [401]);
  deny("expired OIDC token", "GET", "/audit", f.expired, undefined, [401]);
  deny("token for another audience", "GET", "/audit", f.wrongAudience, undefined, [401]);
  deny("garbage bearer", "GET", "/profile/me", "not-a-jwt", undefined, [401]);
  deny("tampered team token", "GET", "/checkpoint/me", f.teamSwap, undefined, [401, 403]);

  // --- authorization (valid identity, wrong role) ---------------------------
  const participant = data.teams[0].members[1].token;
  const teamToken = data.teams[0].teamToken;
  const staff = data.staff[0].token;
  const guide = data.guides[0].token;
  deny("participant creating a team", "POST", "/team/", participant, { name: "hack" });
  deny("participant reading audit", "GET", "/audit", participant);
  deny("participant changing settings", "PUT", "/rally/settings", participant, data.settings);
  deny("participant evaluating", "POST", `/staff/teams/${data.teams[0].id}/activities/${data.checkpoints[0].activities[0].id}/evaluate`, participant, { result_data: { success: true } });
  deny("team token on staff list", "GET", "/staff/teams", teamToken);
  deny("team token creating checkpoint", "POST", "/checkpoint/", teamToken, { name: "x", order: 99 });
  deny("staff deleting a team", "DELETE", `/team/${data.raceTeam.id}`, staff);
  deny("staff exporting results", "GET", `/events/${data.eventId}/export`, staff);
  deny("guide on staff endpoints", "GET", "/staff/teams", guide, undefined, [401, 403, 404]);
  deny("guide broadcasting push", "POST", "/push/broadcast", guide, { title: "x", body: "y" }, [401, 403, 422]);
  deny("plain user on admin metrics", "GET", "/admin/metrics", data.plainUser);
  // Staff at post 1 must not score a team at another post's activity.
  const otherCp = data.checkpoints[data.checkpoints.length - 1];
  deny(
    "staff scoring another post's activity",
    "POST",
    `/staff/teams/${data.teams[0].id}/activities/${otherCp.activities[0].id}/evaluate`,
    staff,
    { result_data: { success: true } },
    [400, 403, 404, 409],
  );

  // --- input validation: 4xx, never 5xx -------------------------------------
  const cp = data.checkpoints[0];
  const bad = (label, method, path, token, body) => {
    const res = api(method, path, { token, ip, body, expect: [400, 404, 409, 422], name: `VAL ${method} ${path.replace(/\d+/g, "{id}")}` });
    check(res, { [`rejected with 4xx: ${label}`]: (r) => r.status >= 400 && r.status < 500 });
  };
  bad("login without code", "POST", "/team-auth/login", null, {});
  bad("arrive with latitude 999", "POST", `/checkpoint/${cp.id}/arrive`, teamToken, { latitude: 999, longitude: 0 });
  bad("arrive at non-existent post", "POST", "/checkpoint/99999999/arrive", teamToken, { latitude: 0, longitude: 0 });
  bad("evaluate with wrong result_data shape", "POST", `/staff/teams/${data.raceTeam.id}/activities/${cp.activities[0].id}/evaluate`, data.admins[0].token, { result_data: { wrong: 1 } });
  bad("evaluate non-existent team", "POST", `/staff/teams/99999999/activities/${cp.activities[0].id}/evaluate`, data.admins[0].token, { result_data: { success: true } });
  bad("checkpoint with negative order", "POST", "/checkpoint/", data.admins[0].token, { name: "x", order: "abc" });
  bad("contest with empty body", "POST", "/team-auth/evaluations/99999999/contest", teamToken, {});

  think(1, 3);
}

/**
 * One address brute-forcing team access codes. The limiter (10 attempts per
 * 5 min per IP and per code) must start answering 429 well before 40 tries.
 */
export function loginAbuse() {
  const ip = ipFor("abuse", randInt(1000));
  let limited = 0;
  for (let i = 0; i < 40; i++) {
    // Well-formed (XXXX-XXXX) but wrong, so it reaches the limiter.
    const code = `${uuid().slice(0, 4)}-${String(1000 + i)}`.toUpperCase();
    const res = api("POST", "/team-auth/login", { ip, body: { access_code: code }, expect: [401, 429], name: "ABUSE POST /team-auth/login" });
    if (res.status === 429) {
      limited++;
      rateLimited.add(1);
    }
  }
  if (__ENV.DEBUG) console.warn(`login abuse: ${limited}/40 limited`);
  check(limited, { "brute force on team login is rate limited": (n) => n >= 20 });
}

/**
 * Concurrency correctness: ten simultaneous evaluations of the same team and
 * activity (different keys) must create exactly one result; ten simultaneous
 * retries with the same key must all return that same result.
 */
export function evaluationRace(data) {
  const team = data.raceTeam;
  const a = data.checkpoints[0].activities[1] || data.checkpoints[0].activities[0];
  const admin = data.admins[0];
  const url = `${API_V1}/staff/teams/${team.id}/activities/${a.id}/evaluate`;
  const params = (key) => ({
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}`, "Idempotency-Key": key, "X-Forwarded-For": ipFor("admin", 50) },
    tags: { name: "RACE POST evaluate" },
    responseCallback: http.expectedStatuses(200, 400, 409),
  });
  const body = JSON.stringify({ result_data: { success: true }, extra_shots: 0 });
  const res = http.batch(Array.from({ length: 10 }, () => ["POST", url, body, params(uuid())]));
  const created = res.filter((r) => r.status === 200);
  const ids = new Set(created.map((r) => (json(r) || {}).id));
  check(res, {
    "race: no 5xx under concurrent evaluation": (rs) => rs.every((r) => r.status < 500),
    "race: exactly one result row for team+activity": () => ids.size === 1,
  });

  const key = uuid();
  const replay = http.batch(Array.from({ length: 10 }, () => ["POST", url, body, params(key)]));
  const rids = new Set(replay.filter((r) => r.status === 200).map((r) => (json(r) || {}).id));
  check(replay, {
    "race: same idempotency key never 5xx": (rs) => rs.every((r) => r.status < 500),
    "race: same idempotency key never creates a second row": () => rids.size <= 1,
  });

  // Ten simultaneous arrivals of the same team at the same post.
  const cp = data.checkpoints[0];
  const arr = http.batch(
    Array.from({ length: 10 }, () => [
      "POST",
      `${API_V1}/checkpoint/${cp.id}/arrive`,
      JSON.stringify({ latitude: cp.lat, longitude: cp.lng }),
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${team.teamToken}` }, tags: { name: "RACE POST arrive" }, responseCallback: http.expectedStatuses(200, 400, 409) },
    ]),
  );
  check(arr, { "race: concurrent arrivals never 5xx": (rs) => rs.every((r) => r.status < 500) });
}

/**
 * Live leaderboard over SSE. k6 has no SSE client, so each VU opens the
 * stream and holds it until the request timeout: a healthy server keeps it
 * open (k6 reports a timeout, error_code 1050) and never answers 4xx/5xx.
 */
export function sseListener(data) {
  const t = data.teams[randInt(data.teams.length)];
  const path = rand() < 0.7 ? "/scoreboard/stream" : "/events/stream";
  const res = http.get(`${API_V1}${path}`, {
    headers: { Authorization: `Bearer ${t.teamToken}`, Accept: "text/event-stream" },
    timeout: "15s",
    tags: { name: `SSE ${path}` },
    responseCallback: http.expectedStatuses(200, 0),
  });
  check(res, { "SSE stream stays open (no 4xx/5xx)": (r) => r.status === 200 || r.error_code === 1050 });
}
