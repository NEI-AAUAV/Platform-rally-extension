# Full-stack e2e (`tests/e2e-fullstack/`)

Playwright specs in this directory run against a **real** api-rally backend
(Postgres + Redis + a fake OIDC provider), not route-mocked responses. They
exist to catch integration bugs a mocked test can't — a broken form, a drifted
API contract, a real concurrency/race condition — which the much larger mocked
suite in `tests/e2e/` cannot detect because its API responses are hand-written
fixtures, not the real backend.

## Prerequisites

Start the smoke stack from `api-rally/`:

```sh
docker compose -f api-rally/docker-compose.smoke.yml up -d postgres redis fake-oidc api
```

This exposes:
- the API at `http://localhost:8003` (override with `FULLSTACK_API_BASE_URL`)
- the fake OIDC provider's token-minting endpoint at `http://localhost:9009/mint`
  (override with `FULLSTACK_OIDC_URL`)

The Postgres/Redis in this stack are **disposable but not reset between runs**
— every spec seeds its own uniquely-named event/checkpoints/teams/users per
run (see the `helpers/` files) so specs don't collide with leftover data from
previous runs, but nothing here cleans up after itself.

## Running

```sh
pnpm run generate-client   # keep the typed client in sync with the running API
pnpm exec playwright test --project=fullstack
```

The `fullstack` Playwright project (see `playwright.config.ts`) builds and
serves the web app on port 4174, proxying `/api` to the real backend above,
and runs with a single worker — several specs here deliberately drive real
concurrency (multiple browser contexts acting at once), which parallel test
files would only confuse.

## What each spec covers

| Spec | Covers |
|---|---|
| `golden-path.spec.ts` | Team login with a real access code, staff check-in, evaluation, scoreboard — the smallest real round trip. Also: admin panel reads real checkpoint data; invalid access codes are rejected by the real backend. |
| `scoring-oracle.spec.ts` | Scoring arithmetic (boolean, score-based, extra shots + penalties, zero-clamping) reimplemented independently and diffed against the real `/staff/teams/{id}/activities` response — catches scoring engine regressions a mocked test can't, since the mock would just repeat the same (possibly wrong) formula. |
| `admin-setup.spec.ts` | The admin **UI itself** — event creation, checkpoint/activity forms, team creation, staff assignment, a settings toggle — each filled and clicked, then cross-checked by reading the created rows back from the API. Everything else in this directory seeds its fixtures via direct API calls and never touches these forms; this is the one spec that would catch a broken admin form. |
| `guide-and-badges.spec.ts` | Guide-mode (a guide viewing their checkpoint's real indications) running concurrently with a staff evaluation that triggers a real `FIRST_COMPLETE_CHECKPOINT` badge auto-award, confirmed on the team's own `/achievements` page. |
| `scoreboard-sse.spec.ts` | The real `/scoreboard/stream` SSE endpoint: a public scoreboard page, opened once and never reloaded, must reflect a staff evaluation submitted afterwards — proves the live-update wiring works against the real backend, not just a mocked `EventSource`. |
| `rally-day.spec.ts` | The master concurrency scenario — 7 simultaneous browser contexts (admin, 2 staff, 4 teams) racing through a real 2-checkpoint journey, with deliberately injected incidents (duplicate check-in, concurrent UI evaluations at two checkpoints, an offline-mid-submit recovery). This is the one test in the suite built specifically to catch cross-context race conditions. |
| `security-abac.spec.ts` | ABAC boundaries against the real backend: staff evaluating an activity at a checkpoint they aren't assigned to gets a real 404 (not 403 — `RallyNotFoundError`, confirmed by reading `staff_evaluation.py`, not assumed); a genuine team JWT is rejected by admin/staff-only endpoints and the admin UI itself; a checkpoint's public payload is confirmed to never contain a guide indication's `expected_answer`. |
| `multi-edicao.spec.ts` | Multi-edition isolation against the real backend: switching the current edition through the admin UI changes which checkpoints/teams are visible; a team from a non-current edition can still log in (access codes are intentionally global per `crud_team.get_by_access_code` — isolation is enforced at listing/check-in, not login) but is absent from the current edition's team listing; checking a team in at a checkpoint from a different edition is rejected (404, `_require_same_event`). This surfaced a real discrepancy with `tests/e2e/multi-edicao.spec.ts`'s mocked "non-current access code is rejected by login" test, which asserts something the real backend does not do. |
| `olympic-rotation.spec.ts` | The real `POST /events/{id}/rotation-schedule` endpoint (`app/utils/round_robin.py`'s `generate_schedule`): a 3-team/4-checkpoint schedule is checked for the invariants the algorithm guarantees (no team double-booked within a round, every team-checkpoint pair covered at least once, `max(teams, checkpoints)` rounds) rather than one exact ordering, since team/checkpoint query order isn't pinned by an explicit `ORDER BY` server-side. Also: rejected (400) for a non-olympic event or an event with no teams/checkpoints yet. No browser needed — this is a pure-function/API contract check. |

| `pwa.spec.ts` | The manifest and service worker are served by the real `vite preview` production build (`dist/`) this project runs against, not a route-mocked `/manifest.json` — and the app shell itself renders successfully against the real backend through the proxy. The offline evaluation *queue* against a real backend (the part that actually depends on backend behavior) is already covered by `rally-day.spec.ts`'s incident 3, so this spec only covers what that one and the mocked `tests/e2e/offline-pwa.spec.ts` don't: that the built PWA artifacts are actually served correctly. |

## Known gaps (not yet covered against a real backend)

None outstanding — every area previously listed here now has fullstack
coverage. If a new backend-contract-dependent feature area is added without a
fullstack counterpart, list it here until it's covered.

## Team-login rate limiting across a full run

`check_login_rate_limit` (`app/api/rate_limit.py`) is keyed **per client IP**,
not per access code, with a real Redis-backed fixed window (10 attempts /
5 min by default). Every spec here runs from the same test-runner IP against
the same backend, so UI-driven team logins accumulate *across the whole
suite* — `rally-day.spec.ts` alone logs in 4 teams. Prefer `POST
/team-auth/login` via `fetch` (see `security-abac.spec.ts`'s "team
access-token" test) over driving `/rally/team-login` through the browser
when a spec doesn't specifically need to prove the *login form* works — the
resulting JWT is equally real either way, and it keeps the full-suite budget
from tipping over into a spurious "Too many requests" failure.
