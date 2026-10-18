import exec from "k6/execution";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { EVAL_WAIT_SECONDS, THINK_SCALE, TRAVEL_SECONDS } from "../lib/config.js";
import { api, call, chance, pick, think } from "../lib/http.js";

export const postsResolved = new Counter("rally_posts_resolved");
export const postsSkipped = new Counter("rally_posts_skipped");
export const teamsFinished = new Counter("rally_teams_finished");
export const waitForStaff = new Trend("rally_wait_for_staff_ms", true);
export const routeDuration = new Trend("rally_route_duration_ms", true);

const FAR = 0.0015; // ~165 m, outside the 60 m geofence

/**
 * One VU per team, walking the whole route once: read the next post, home in
 * with proximity reads, register the arrival (GPS geofence for even teams, the
 * staff's rotating QR for odd ones), then wait for staff to evaluate before
 * moving on. Stuck teams reveal a hint and, eventually, skip the post.
 */
export function teamRoute(data) {
  const idx = exec.scenario.iterationInTest;
  if (idx >= data.teams.length) return;
  const team = data.teams[idx];
  const captain = team.members[0];
  const T = { token: team.teamToken, ip: team.ip };
  const started = Date.now();
  // Stagger starts like a real wave start.
  sleep((idx % 10) * 2 * THINK_SCALE);

  for (let guard = 0; guard < data.checkpoints.length + 2; guard++) {
    const next = call("GET", "/checkpoint/me", { ...T, expect: [200, 404] });
    if (next.res.status === 404 || !next.body || !next.body.id) break;
    const cp = data.checkpoints.find((c) => c.id === next.body.id);
    if (!cp) break;
    const cpPath = (suffix) => ({ path: `/checkpoint/${cp.id}/${suffix}`, name: `POST /checkpoint/{id}/${suffix}` });

    // Walking towards the post.
    let p = cpPath("proximity");
    call("POST", p.path, { ...T, name: p.name, body: { latitude: cp.lat + FAR, longitude: cp.lng }, business: true, expect: [200, 400] });
    think(TRAVEL_SECONDS * 0.5, TRAVEL_SECONDS);
    if (chance(0.25)) {
      call("GET", `/checkpoint/${cp.id}/hints`, { ...T, name: "GET /checkpoint/{id}/hints" });
      p = cpPath("hint");
      // No hint text is configured, so 400 ("nothing left") is a valid answer.
      call("POST", p.path, { ...T, name: p.name, expect: [200, 400] });
    }
    // Staff may already have scored the team on its way in (they see teams
    // heading to their post), in which case the post is no longer "next": 400.
    p = cpPath("proximity");
    call("POST", p.path, { ...T, name: p.name, body: { latitude: cp.lat + 0.0002, longitude: cp.lng }, business: true, expect: [200, 400] });

    // A GPS fix outside the fence must be refused.
    p = cpPath("arrive");
    if (chance(0.2)) call("POST", p.path, { ...T, name: p.name, body: { latitude: cp.lat + FAR, longitude: cp.lng }, expect: [400, 403, 422], check: "arrive outside geofence is refused" });

    if (idx % 2 === 0) {
      call("POST", p.path, { ...T, name: p.name, body: { latitude: cp.lat + 0.0001, longitude: cp.lng }, business: true, expect: [200, 400, 409] });
    } else {
      const staff = pick(data.staff.filter((s) => s.cp === cp.order - 1));
      const qr = call("GET", "/checkpoint/checkin-token", { token: staff.token, ip: staff.ip });
      if (qr.body && qr.body.token) {
        call("POST", "/checkpoint/check-in", { ...T, body: { token: qr.body.token }, business: true, expect: [200, 409] });
        if (chance(0.2)) {
          // Re-scanning the same QR is tolerated (idempotent arrival).
          call("POST", "/checkpoint/check-in", { ...T, body: { token: qr.body.token }, business: true, expect: [200, 400, 409] });
        }
      }
      if (chance(0.1)) call("POST", "/checkpoint/check-in", { ...T, body: { token: "forged.token" }, expect: [400, 401, 403, 404, 422], check: "forged QR token is refused" });
    }

    // Wait for the staff evaluation, polling like the app does.
    const arrived = Date.now();
    let moved = false;
    while ((Date.now() - arrived) / 1000 < EVAL_WAIT_SECONDS) {
      think(4, 6);
      const now = call("GET", "/checkpoint/me", { ...T, expect: [200, 404] });
      call("GET", "/team/me", { token: captain.token, ip: captain.ip });
      if (now.res.status === 404 || !now.body || now.body.id !== cp.id) {
        moved = true;
        break;
      }
    }
    if (moved) {
      waitForStaff.add(Date.now() - arrived);
      postsResolved.add(1);
    } else {
      p = cpPath("skip");
      const res = api("POST", p.path, { ...T, name: p.name, business: true });
      check(res, { "skip a stuck post -> 200": (r) => r.status === 200 });
      postsSkipped.add(1);
    }
  }

  const me = call("GET", "/team/me", { token: captain.token, ip: captain.ip });
  if (me.body && me.body.is_route_finished) {
    teamsFinished.add(1);
    routeDuration.add(Date.now() - started);
  }
  check(me.body, { "team finished the route": (b) => !!b && b.is_route_finished === true });
}
