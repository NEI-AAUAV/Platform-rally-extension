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
| `guide-and-badges.spec.ts` | Guide-mode (a guide viewing their checkpoint's real indications) running concurrently with a staff evaluation that triggers a real `FIRST_COMPLETE_CHECKPOINT` badge auto-award, confirmed on the team's own `/conquistas` page. |
| `scoreboard-sse.spec.ts` | The real `/scoreboard/stream` SSE endpoint: a public scoreboard page, opened once and never reloaded, must reflect a staff evaluation submitted afterwards — proves the live-update wiring works against the real backend, not just a mocked `EventSource`. |
| `rally-day.spec.ts` | The master concurrency scenario — 7 simultaneous browser contexts (admin, 2 staff, 4 teams) racing through a real 2-checkpoint journey, with deliberately injected incidents (duplicate check-in, concurrent UI evaluations at two checkpoints, an offline-mid-submit recovery). This is the one test in the suite built specifically to catch cross-context race conditions. |

## Known gaps (not yet covered against a real backend)

These currently exist **only** as mocked specs in `tests/e2e/` — their mocks
could drift from the real API contract and nothing here would catch it:

- Multi-edition / event switching (`tests/e2e/multi-edicao.spec.ts`)
- Olympic rotation-schedule generation (`tests/e2e/olympic-rotation.spec.ts`)
- ABAC security boundaries (`tests/e2e/security-abac.spec.ts`)
- PWA install / offline manifest behavior (`tests/e2e/offline-pwa.spec.ts`)

Left as mocked-only for now: the cost of running them against a disposable,
not-reset-between-runs Postgres (event isolation, rotation-schedule
determinism) is higher than for the specs above, and the mocked coverage is
already thorough. Promote them to this directory if the mocked/real contract
ever needs re-verifying — the seeding pattern in `helpers/seedRally.ts` and
`helpers/seedRallyDay.ts` (fresh event per call, lazy user-row materialization
via one authenticated call before assignment) covers everything needed to do
so.
