import exec from "k6/execution";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { resultFor } from "../lib/seed.js";
import { api, call, chance, json, think, uuid } from "../lib/http.js";
import { randInt } from "../lib/rand.js";

export const evaluationsCreated = new Counter("rally_evaluations_created");
export const evaluationConflicts = new Counter("rally_evaluation_conflicts");

/**
 * A staff member at a post: watches the list of teams heading to their post,
 * scans arriving teams' QR codes, evaluates every pending activity, now and
 * then corrects a score or looks at its history, and keeps the rotating
 * self-check-in QR on screen. Two staff share each post, so they race each
 * other on the same team exactly as on the real day.
 */
export function staffShift(data) {
  const s = data.staff[(exec.vu.idInTest - 1) % data.staff.length];
  const cp = data.checkpoints[s.cp];
  const S = { token: s.token, ip: s.ip };

  if (chance(0.2)) call("GET", "/staff/my-checkpoint", S);
  if (chance(0.3)) call("GET", "/checkpoint/checkin-token", S);

  const teams = call("GET", "/staff/teams", S).body || [];
  const due = teams.filter((t) => t.current_checkpoint_number === cp.order && !t.evaluated_at_current_checkpoint);

  for (const t of due) {
    const teamData = data.teams.find((x) => x.id === t.id);
    if (teamData && chance(0.3)) {
      // Scanning the team's QR (its access code) to open the right sheet.
      call("POST", "/checkpoint/staff-check-in", { ...S, body: { team_code: teamData.code, checkpoint_id: cp.id }, business: true, expect: [200, 400, 409] });
    }
    const sheet = call("GET", `/staff/teams/${t.id}/activities`, { ...S, name: "GET /staff/teams/{id}/activities" }).body;
    if (!sheet || !sheet.activities) continue;
    for (const a of sheet.activities) {
      if (a.evaluation_status !== "pending") continue;
      const key = uuid();
      const body = { result_data: resultFor(a.activity_type), extra_shots: randInt(3) };
      const path = `/staff/teams/${t.id}/activities/${a.id}/evaluate`;
      const name = "POST /staff/teams/{id}/activities/{id}/evaluate";
      const res = api("POST", path, { ...S, name, body, headers: { "Idempotency-Key": key }, business: true });
      // 200 = scored; 400/409 = the other staff member at this post got there first.
      check(res, { "evaluate -> 200 or lost the race (400/409)": (r) => [200, 400, 409].includes(r.status) });
      if (res.status === 200) {
        evaluationsCreated.add(1);
        const result = json(res);
        if (chance(0.1)) {
          // Flaky network: the phone retries with the same key -> replay, same row.
          const again = api("POST", path, { ...S, name, body, headers: { "Idempotency-Key": key } });
          check(again, { "idempotent replay returns the same result": (r) => r.status === 200 && (json(r) || {}).id === result.id });
        }
        if (chance(0.03)) {
          // Same key, different payload must be refused.
          const other = { ...body, extra_shots: body.extra_shots + 1 };
          const bad = api("POST", path, { ...S, name, body: other, headers: { "Idempotency-Key": key }, expect: [409, 422] });
          check(bad, { "idempotency key reuse with new payload -> 409": (r) => r.status === 409 || r.status === 422 });
        }
        if (chance(0.05)) {
          call("PUT", `${path}/${result.id}`, {
            ...S,
            name: "PUT /staff/teams/{id}/activities/{id}/evaluate/{id}",
            body: { result_data: resultFor(a.activity_type), extra_shots: 0 },
            business: true,
            expect: [200, 400, 403, 409],
          });
        }
        if (chance(0.05)) call("GET", `/staff/evaluations/${result.id}/history`, { ...S, name: "GET /staff/evaluations/{id}/history", expect: [200, 403, 404] });
      } else {
        evaluationConflicts.add(1);
      }
    }
  }
  think(2, 5);
}
