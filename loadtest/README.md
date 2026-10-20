# Rally load tests (k6)

A whole rally day against a real `api-rally` + Postgres + Redis: **150 OIDC
participants** in 30 teams (configurable, ≥120 by default) plus everyone else —
staff at every post, guides, organizers, anonymous spectators, live
leaderboard (SSE) listeners — and an attacker or two.

Authentication is real: tokens are RS256 JWTs minted by the fake OIDC provider
(`api-rally/scripts/smoke/fake_oidc_provider.py`, the same one the smoke and
fullstack e2e suites use), and the API validates them through its normal
discovery + JWKS path. Team phones use the real access-code login (HS256 team
tokens). Nothing is mocked or bypassed.

## Running

With docker (builds and tears down the whole stack):

```bash
make load-test                    # PROFILE=load
make load-test PROFILE=smoke      # 90 s sanity run
make load-test PROFILE=stress
```

Against an already running API (e.g. local dev), with a local `k6`:

```bash
# fake IdP; point the API's OIDC_PROVIDER_URL at it and OIDC_CLIENT_ID=rally-load-client
FAKE_OIDC_ISSUER=http://127.0.0.1:9009 FAKE_OIDC_CLIENT_ID=rally-load-client \
  poetry -C api-rally run python api-rally/scripts/smoke/fake_oidc_provider.py &

# the API must trust the load generator as a proxy so X-Forwarded-For works:
#   TRUSTED_PROXIES='["127.0.0.1"]'
k6 run -e PROFILE=load -e API_URL=http://127.0.0.1:8003 -e OIDC_URL=http://127.0.0.1:9009 \
  --summary-export loadtest/results/summary.json loadtest/k6/rally.js
```

Every run seeds its **own fresh event** through the public API (and makes it
the current event), so it never touches existing data other than switching the
current event — don't point it at production.

## Profiles

| `PROFILE` | Duration | Think time | Spectators | Final spike | SSE listeners |
|-----------|----------|------------|------------|-------------|---------------|
| `smoke`   | 90 s     | ×0.3       | 2 rps      | 20 rps      | 5             |
| `load`    | 10 min   | ×1         | 10 rps     | 80 rps      | 40            |
| `stress`  | 10 min   | ×0.25      | 40 rps     | 250 rps     | 120           |
| `soak`    | 60 min   | ×1         | 10 rps     | 80 rps      | 40            |
| `spike`   | 5 min    | ×0.5       | 10 rps     | 400 rps     | 60            |

Knobs (`-e NAME=value` or env for `make`): `TEAMS` (30), `MEMBERS_PER_TEAM` (5),
`CHECKPOINTS` (8), `STAFF_PER_CHECKPOINT` (2), `GUIDES` (10), `ADMINS` (2),
`MANAGERS` (1), `DURATION`, `THINK_SCALE`, `TRAVEL_SECONDS` (20),
`EVAL_WAIT_SECONDS` (120), `SPECTATOR_RATE`, `SPIKE_TARGET`, `SSE_VUS`,
`SCENARIOS` (comma list to run a subset), `DEBUG=1` (log every failed check
with the response body).

## Scenarios

| Scenario | Who | What it does |
|----------|-----|--------------|
| `participants` | 150 OIDC team members | App open all day: profile, own team, next post, hints, live scoreboard, pace ranking, badges, evaluations; occasional token refresh / re-login |
| `team_route` | 1 phone per team | Walks the whole route: proximity reads, hint reveals, GPS arrival (even teams) or QR self-check-in from the staff's rotating token (odd teams), waits for evaluation, skips a post when stuck; refused out-of-fence arrivals and forged QR |
| `staff` | 2 per post | Polls teams heading to their post, scans team QR, evaluates every pending activity (all 4 activity types, extra shots) with `Idempotency-Key`; retries with the same key, key reuse with a different payload (→409), corrections, history. The two staff of a post race each other |
| `guides` | 10 | Follow their team, list teams at its post, register manual arrivals; cannot see other posts |
| `organizers` | 2 admins + 1 manager | Control room: teams, all evaluations, rankings, route status, audit, metrics, assignments, xlsx export, report, recompute |
| `spectators` | anonymous, arrival-rate | Public settings, current event, badges, rules, VAPID key, readiness |
| `sse` | team phones | Hold `/scoreboard/stream` and `/events/stream` open |
| `security` | — | Forged tokens (payload escalation, `alg=none`, HS256 confusion, expired, wrong audience, garbage, tampered team token) → 401; every role on endpoints it must not reach → 401/403; malformed input → 4xx, never 5xx |
| `login_abuse` | one IP | 40 well-formed wrong access codes → the login limiter must answer 429 |
| `races` | — | 10 concurrent evaluations of the same team+activity → exactly one result; 10 concurrent retries with one key → one row; 10 concurrent arrivals → no 5xx |
| `scoreboard_spike` | everyone | Final leaderboard reveal: ramping arrival rate on scoreboard/team/pace ranking |

## Pass/fail

Thresholds (the run exits non-zero when any is crossed):

- `http_req_failed < 1%`, `checks > 99%`; `security` and `races` checks must be 100%
- p95 < 800 ms / p99 < 2 s overall; participants p95 < 600 ms; staff p95 < 1 s;
  evaluate p95 < 1.2 s; arrive p95 < 800 ms; scoreboard p95 < 600 ms; spike p95 < 1.5 s
- ≥90% of teams finish the route; p95 wait for staff evaluation < 60 s

Custom metrics: `rally_posts_resolved`, `rally_posts_skipped`,
`rally_teams_finished`, `rally_wait_for_staff_ms`, `rally_route_duration_ms`,
`rally_evaluations_created`, `rally_evaluation_conflicts`,
`rally_rate_limited_429`.

Results land in `loadtest/results/` (git-ignored): `summary-<profile>.json`
and the raw per-request CSV.
