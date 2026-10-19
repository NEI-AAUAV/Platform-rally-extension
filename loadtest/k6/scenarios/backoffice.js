import exec from "k6/execution";
import { check } from "k6";
import { api, call, chance, pick, think } from "../lib/http.js";

/** A guide walking with their team, following its progress. */
export function guideShift(data) {
  const g = data.guides[(exec.vu.idInTest - 1) % data.guides.length];
  const G = { token: g.token, ip: g.ip };
  const team = call("GET", "/guide/team", G).body;
  const cps = call("GET", "/guide/checkpoints", G).body || [];
  // Only the post the guide's team is at (or heading to) is theirs to see.
  const here = team && cps.find((c) => c.order === team.current_checkpoint_number);
  if (here) call("GET", `/guide/checkpoints/${here.id}/teams`, { ...G, name: "GET /guide/checkpoints/{id}/teams" });
  if (cps.length && chance(0.1)) {
    // A guide may also still see the post their team just resolved, and the
    // team can move between the reads above and this call, so only posts well
    // clear of the current one count as "someone else's".
    const current = team ? team.current_checkpoint_number : null;
    const other = pick(cps.filter((c) => current !== null && (c.order >= current + 2 || c.order <= current - 3)));
    if (other) call("GET", `/guide/checkpoints/${other.id}/teams`, { ...G, name: "GET /guide/checkpoints/{id}/teams (other)", expect: [403], check: "guide cannot list another post's teams" });
  }
  if (team && team.current_checkpoint_number && chance(0.15)) {
    const cp = data.checkpoints.find((c) => c.order === team.current_checkpoint_number);
    // Manual arrival is idempotent-ish: the team may already be registered.
    if (cp)
      call("POST", `/guide/checkpoints/${cp.id}/arrivals`, {
        ...G,
        name: "POST /guide/checkpoints/{id}/arrivals",
        body: { team_id: g.teamId },
        business: true,
        expect: [200, 201, 400, 409],
      });
  }
  call("GET", "/scoreboard/live", G);
  think(5, 10);
}

/** Organizers watching the control room. */
export function adminDashboard(data) {
  const pool = data.admins.concat(data.managers);
  const a = pool[(exec.vu.idInTest - 1) % pool.length];
  const A = { token: a.token, ip: a.ip };
  const e = data.eventId;

  call("GET", "/team/", A);
  call("GET", "/staff/all-evaluations", A);
  call("GET", "/scoreboard/live", A);
  call("GET", "/activities/ranking/global", A);
  call("GET", "/rally/duration", A);
  call("GET", "/rally/pace-ranking", A);
  call("GET", "/checkpoint/admin/route", A);
  call("GET", `/events/${e}/configuration-status`, { ...A, name: "GET /events/{id}/configuration-status" });
  call("GET", "/activities/deferred/pending", A);
  call("GET", "/user/staff-assignments", A);
  call("GET", "/user/guide-assignments", A);
  call("GET", "/rally/settings", A);
  if (chance(0.5)) call("GET", "/audit", A);
  if (chance(0.5)) call("GET", "/admin/metrics", A);
  if (chance(0.3)) call("GET", "/activities/results", A);
  if (chance(0.3)) call("GET", `/checkpoint/teams?checkpoint_id=${pick(data.checkpoints).id}`, { ...A, name: "GET /checkpoint/teams" });
  if (chance(0.2)) call("GET", `/team/${pick(data.teams).id}/evaluations`, { ...A, name: "GET /team/{id}/evaluations" });
  if (chance(0.2)) call("GET", `/activities/${data.checkpoints[0].activities[0].id}/statistics`, { ...A, name: "GET /activities/{id}/statistics" });
  if (chance(0.1)) {
    const x = api("GET", `/events/${e}/export`, { ...A, name: "GET /events/{id}/export", timeout: "60s" });
    check(x, { "xlsx export -> 200": (r) => r.status === 200 && r.body.length > 1000 });
  }
  if (chance(0.05)) call("GET", `/events/${e}/report`, { ...A, name: "GET /events/{id}/report", timeout: "60s" });
  if (chance(0.05)) call("POST", "/scoreboard/recompute", { ...A, expect: [200, 202, 204] });
  think(5, 10);
}

/** Unauthenticated visitors: the public leaderboard screen, the landing page. */
export function spectator(data) {
  const ip = `10.6.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const team = pick(data.teams);
  call("GET", "/rally/settings/public", { ip });
  call("GET", "/events/current", { ip });
  if (chance(0.5)) call("GET", "/events", { ip });
  if (chance(0.5)) call("GET", "/badges", { ip });
  if (chance(0.3)) call("GET", `/teams/${team.id}/badges`, { ip, name: "GET /teams/{id}/badges" });
  if (chance(0.3)) call("GET", "/badge-definitions", { ip });
  if (chance(0.2)) call("GET", "/dynamic-rules", { ip });
  if (chance(0.2)) call("GET", "/push/vapid-public-key", { ip, expect: [200, 404, 503] });
  if (chance(0.1)) call("GET", "/health/ready", { ip });
}
