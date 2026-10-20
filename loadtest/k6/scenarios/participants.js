import exec from "k6/execution";
import { check } from "k6";
import { api, call, chance, json, think } from "../lib/http.js";

function participantFor(data) {
  const all = data.teams.flatMap((t) => t.members.map((m) => ({ ...m, team: t })));
  return all[(exec.vu.idInTest - 1) % all.length];
}

/**
 * A team member with the app open on their phone: signed in through OIDC,
 * polling the home screen (own team, next post, hints, leaderboard, badges)
 * every few seconds. 150 of these run at once by default.
 */
export function participantJourney(data) {
  const p = participantFor(data);
  const me = { token: p.token, ip: p.ip };
  const team = { token: p.team.teamToken, ip: p.ip };

  const profile = call("GET", "/profile/me", { ...me });
  check(profile.body, { "profile has current team": (b) => b && b.current_team_id === p.team.id });

  call("GET", "/team/me", { ...me });
  call("GET", "/rally/settings/public", { ip: p.ip });
  call("GET", "/events/current", { ip: p.ip });
  call("GET", "/checkpoint/me", { ...team, expect: [200, 404] });
  call("GET", "/team-auth/hints", { ...team });

  const board = call("GET", "/scoreboard/live", { ...team });
  check(board.body, { "scoreboard lists every team": (b) => Array.isArray(b) && b.length >= data.teams.length });

  call("GET", "/rally/pace-ranking", { ...team });
  call("GET", `/teams/${p.team.id}/badges`, { ip: p.ip, name: "GET /teams/{id}/badges" });

  if (chance(0.3)) call("GET", `/team/${p.team.id}`, { ...team, name: "GET /team/{id}" });
  if (chance(0.2)) call("GET", `/team/${p.team.id}/evaluations`, { ...team, name: "GET /team/{id}/evaluations" });
  if (chance(0.2)) call("GET", "/checkpoint/", { ...team });
  if (chance(0.1)) call("GET", "/team-auth/verify", { ...team });
  if (chance(0.1)) call("GET", "/profile/history", { ...me });
  if (chance(0.05)) call("GET", `/teams/${p.team.id}/badge-showcase`, { ip: p.ip, name: "GET /teams/{id}/badge-showcase" });
  if (chance(0.03)) {
    // A phone whose team token is close to expiry refreshes it.
    const res = api("POST", "/team-auth/refresh", { ...team });
    check(res, { "team token refresh -> 200": (r) => r.status === 200 && !!(json(r) || {}).access_token });
  }
  if (chance(0.005)) {
    // Someone reinstalls the app and logs in again with the code. Kept rare:
    // the login limiter allows 10 attempts / 5 min per code.
    call("POST", "/team-auth/login", { ip: p.ip, body: { access_code: p.team.code }, expect: [200, 429] });
  }

  think(3, 8);
}

/**
 * The end-of-rally moment: everyone refreshes the leaderboard and their team
 * at once. Driven by a ramping-arrival-rate executor.
 */
export function scoreboardSpike(data) {
  const p = participantFor(data);
  call("GET", "/scoreboard/live", { token: p.team.teamToken, ip: p.ip, tags: { spike: "1" } });
  if (chance(0.5)) call("GET", "/team/me", { token: p.token, ip: p.ip, tags: { spike: "1" } });
  if (chance(0.3)) call("GET", "/rally/pace-ranking", { token: p.team.teamToken, ip: p.ip, tags: { spike: "1" } });
}
