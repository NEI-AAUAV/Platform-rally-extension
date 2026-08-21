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

| `peddy-paper.spec.ts` | The peddy-paper game loop against the real backend: the `event_type` bootstraps the mode's settings (asserted, not set by the fixture); the team's real `/checkpoint/` and `/checkpoint/me` payloads carry the clue and *not* the name/coordinates — the actual security property, which a mocked spec cannot check since its fixture author decides the payload; media for an unreached post is 403; the hint ladder charges once per rung, refuses a post the team hasn't reached, and never returns `expected_answer`; a GPS check-in reveals the post and hands over the next riddle; a wrong-place check-in is rejected with a coarse distance band; the guide sees the clue. Also staggered starts (`start_offset_minutes`). This spec caught a real bug: the check-in button required coordinates the server deliberately withholds in this mode, so the loop was unplayable through the UI. |

| `master-peddy-tascas-day.spec.ts` | The whole peddy-tascas day, end to end. Phase 1 builds the event through the **real admin UI** — event type, three posts with their riddles/coordinates/geofence, the hint ladder, activities, five teams, staff and guide assignments, and the mode's settings — then reads every row back from the API. Phases 2-4 play it out with 11 concurrent contexts and every role the system has (admin, `manager-rally`, 2× `rally-staff`, 2× `rally-guide`, 5 teams, an anonymous public viewer), with the five teams taking five different routes through the same riddle: solved outright, found with the proximity aid, found after buying the hint ladder, given up on, and — for the team whose phone died — vouched for by its guide. `manager-rally` and the guide's manual-arrival fallback were exercised by no fullstack spec before this one. Also, at the last post: a closed door (`available_from`) telling a team when it opens and the `checkpoint_hours_enabled` escape hatch that overrides it, arrival by scanning the post's rotating QR (plus the replay, out-of-order, forged-token and foreign-post-mint refusals), and walk-up registration refused until `allow_staff_registration` is switched on mid-event. Ends on the scoring arithmetic (what each exit cost, exactly, on both the team's total and the public board), the audit trail behind the vouched-for arrival, and the XLSX/PDF exports. |

| `peddy-paper-aveiro.spec.ts` | A **real past edition**, rebuilt from the organizers' own planning sheet and then run. Where `master-peddy-tascas-day.spec.ts` invents a route to exercise the mode, this one is fixed by what actually happened and the test has to cope — which reaches corners a synthetic route never does. Setup transcribes the sheet through the admin UI: every post's three columns (`staff_script` / `clue` / `challenge_brief` — the first and third had never been filled by any test, and are asserted absent from every participant payload), the route's **two stages** (university in order, outside as a set where 3 of 4 suffice), a venue still undecided when the sheet was written ("CF DECIDE" — `is_draft` + `is_placeholder`, invisible to teams and guides until it is settled), and **four different activity types** with each one's own config inputs plus the "cada falha bebe" counters. The day then runs with 4 teams, 2 guides, the staffed posts, the admin and an anonymous viewer all acting at once: pass/fail with a miss counter, a scored challenge, a race against the clock, free choice inside the second stage, and — for "mais criativo recebe uma salva de palmas", which nobody at a post can judge alone — capture at the post and ranking afterwards. |

| `versus.spec.ts` | Head-to-head, where a post is a match rather than a solo challenge. Pairing is checked for the property a mocked test cannot see — that it is *mutual*, and that re-pairing an already-paired team is refused rather than orphaning its opponent. Scoring goes through the real `TeamVsActivity`: base + completion + outcome, three tiers priced differently so a dropped or doubled one cannot hide, asserted for both sides of a decided match and of a draw. Also pins a product gap: the staff member running the match **cannot record it** (403) — see the known gaps below. |

| `scoring-levers.spec.ts` | Every way points move that is not a staff member scoring an activity. **Leg-time** is the only scoring nobody triggers — it fires off the arrival itself — so a fast leg is checked to pay out at its cap, and the "priced at zero means free, not off" convention is checked to leave no award rows at all. **Dynamic rules** are the named prices behind discretionary awards, including that repricing a rule does not retroactively move a total somebody already earned. **Badges** by hand: awarded, showing as earned on the team's board, revoked, refused for an unknown or inactive code, and the `badges_enabled` kill-switch checked to *empty the payload* rather than merely hide the nav. Plus admin metrics as monotonic counters. |

| `ops-and-judging.spec.ts` | Running the event rather than scoring it. **Push** is worth checking here precisely because the smoke stack has no VAPID keypair — which is the state CI runs in: every sending endpoint must fail closed the same way (503), while `unsubscribe` deliberately stays open so a device can always detach. The tests branch on whether keys are present, so a stack that configures them gets stronger assertions instead of being skipped. **Deferred judging by hand** — the other half of the ranking path `peddy-paper-aveiro.spec.ts` covers: a capture waits with `judgment_status: pending_judgment` and no score (`is_completed` is already true, and means the team *did* it, not that anyone judged it), judging is the admin's even at the staff's own post, and a team photo cannot be pointed at a URL the team never submitted. |

| `activity-result-permissions.spec.ts` | One rule across every route that writes an activity result: **staff score at their own post, and nowhere else.** All five used to guard with the context-free `require(...)` dependency, whose missing checkpoint context made the staff rule (`_staff_own_checkpoint`) false for everyone — so they denied every rally-staff member, including the one at the post with the team in front of them. Both halves are asserted per route, because simply dropping the guard would have let any staff member score any post in the event: create, correct, extra shots, penalty and head-to-head each get a "their own post" and a "not somebody else's". Plus that an admin is not confined to a post, and that a bad activity id still reads as 404 rather than as a permission problem. |

| `pwa.spec.ts` | The manifest and service worker are served by the real `vite preview` production build (`dist/`) this project runs against, not a route-mocked `/manifest.json` — and the app shell itself renders successfully against the real backend through the proxy. The offline evaluation *queue* against a real backend (the part that actually depends on backend behavior) is already covered by `rally-day.spec.ts`'s incident 3, so this spec only covers what that one and the mocked `tests/e2e/offline-pwa.spec.ts` don't: that the built PWA artifacts are actually served correctly. |

## Known gaps (not yet covered against a real backend)

**Feature areas with no fullstack counterpart yet.** Each is covered by the
mocked suite in `tests/e2e/` only, so a drift between those fixtures and the
real API would go unnoticed:

- **Anything that needs object storage.** Checkpoint media upload, the clue
  image, and the *successful* half of promoting a deferred photo to the team's
  photo (`/set-team-photo`) all write to R2, which the smoke stack does not
  run. The read paths, the 403s and the "that URL is not one of this result's
  own photos" refusal are covered; the uploads themselves are not, and cannot
  be until the stack grows a MinIO or equivalent.
- **The *configured* push path.** Sending is covered only in its fails-closed
  state, because the smoke stack has no VAPID keypair. Adding one to
  `docker-compose.smoke.yml` would switch `ops-and-judging.spec.ts` onto its
  stronger assertions automatically — it already branches on the key.

**Reachable only through the API, not the UI.** `<ContestButton>`
(`src/pages/team-progress`) has a unit test but is rendered nowhere in the app,
so contesting an evaluation is currently unreachable for a participant.
`master-rally-day.spec.ts` therefore contests via the API.

**Smaller findings these specs ran into**, none fixed here:

- **A team that finishes the route is never told it finished.**
  `RouteFinishedCard` ("Chegaram ao fim!") renders only when `useTeamProgress`
  finds no next post, and that hook derives the next post from
  `team.current_checkpoint_number`. `TeamService` clamps that number to the
  last post's order once everything is resolved instead of moving past it, so
  the client always finds a checkpoint, and a finished team is shown the post
  it just completed as its "próximo posto" indefinitely. The card is
  effectively dead code. Pinned by `peddy-paper-aveiro.spec.ts`, which is the
  only spec that drives a participant screen to the end of a route — the API
  says 6 of 6 and is perfectly right, which is why this survived.

- **A free-choice stage's choice is not offered to the team.** With
  `order_matters: false` the backend accepts a team at any of the stage's
  posts in any order, but the participant screen renders exactly one "próximo
  posto" (`NextCheckpointCard`) and the route list beneath it has no check-in
  control — so a team can only ever press the button for the post the app
  picked. The rule is real and enforced server-side; the freedom it grants is
  unreachable through the UI. `peddy-paper-aveiro.spec.ts` therefore walks its
  teams through the block in the app's order.

- The admin checkpoint list's **edit and delete buttons carry no accessible
  name** — they are icon-only, while the media button beside them has an
  `aria-label`. There is nothing to select them by, so that spec falls back to
  position (`row.locator("button").nth(1)`), which is a workaround rather than
  an endorsement. Worth an `aria-label` each.
- **`/checkpoint/me` and the team's own progress disagree** on a GPS-arrival
  route. That endpoint resolves "next post" from `team.times`, which only
  staff/QR check-ins append to, so once a post has an activity it stays pinned
  there; `TeamService` (what the participant screen renders) resolves it from
  arrivals and results and is correct. Nothing in the app consumes
  `/checkpoint/me` — `peddy-paper.spec.ts` asserts on it, and the participant
  page does not — so this is a contract inconsistency rather than a broken
  screen, but the two should not be two numbers.

Note on `dist/`: the fullstack web server runs `vite preview`, which serves
whatever is already in `dist/` and never rebuilds. After changing app code,
run `pnpm build` before these specs or they will silently test a stale
bundle — the symptom is UI assertions failing while the API-level ones in the
same file pass. If a new backend-contract-dependent feature area is added without a
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
