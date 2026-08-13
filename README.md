# Rally Extension

Rally is the NEI Platform’s competition module. It handles team rosters, checkpoint progress, activity scoring, staff evaluations, and public leaderboards. The extension is split into:

- `api-rally/` – FastAPI service (Python 3.12, SQLAlchemy, PostgreSQL)
- `web-rally/` – React/Vite frontend (TypeScript, Tailwind, Zustand)

## Directory Map

```
rally/
├── api-rally/
│   └── app/
│       ├── api/        # FastAPI routers (thin controllers), auth deps
│       ├── crud/       # Repositories — data access only
│       ├── models/     # SQLAlchemy entities
│       ├── schemas/    # Pydantic DTOs
│       └── services/   # Business logic, one class per domain (see api-rally/README.md)
└── web-rally/
    └── src/
        ├── components/ # UI + themed parts
        ├── pages/      # Route-level screens
        ├── services/   # API client + hooks
        └── stores/     # Zustand state
```

## Local Setup

Copy `.env.example` to `.env` and fill in the OIDC, database, and secret values first.

### Full stack (Docker)
```bash
cp .env.example .env   # then edit
docker compose up --build
```

### Backend
```bash
cd api-rally
poetry install
poetry run uvicorn app.main:app --reload
```
Set the `POSTGRES_*` and OIDC env vars (see `.env.example`).

### Frontend
```bash
cd web-rally
pnpm install
pnpm dev
```
Run the backend first — the dev server proxies API requests to it.

## Testing

```bash
# All tests (from repo root)
./run-tests.sh

# API only
cd api-rally
poetry run pytest

# Frontend only
cd web-rally
pnpm test
```
The backend test suite runs against a real Postgres schema (dropped/recreated per test) and bypasses
OIDC by overriding FastAPI dependencies rather than mocking a JWT verifier — see `api-rally/README.md`
and `TESTING.md` for the `RALLY_TEST_PG` modes. Frontend tests run under Vitest/jsdom.

## API at a Glance

Base path: `/api/rally/v1`

```
GET  /teams
GET  /checkpoints
POST /staff/evaluate
```
Generate the OpenAPI schema (`web-rally/openapi.json`) for the full list.

## Running a Peddy Paper

The same app runs two very different games. A rally is a pub crawl with staff at
every stop; a peddy paper is a treasure hunt where **the checkpoint's location is
the puzzle answer**, so the app must not hand it over. Creating an event with
`event_type = peddy_paper` bootstraps the settings that flip that behaviour:

| Setting | Peddy paper | Rally | What it does |
|---|---|---|---|
| `reveal_next_checkpoint` | off | on | Off redacts name, description and coordinates of any post the team hasn't reached |
| `gps_checkin_enabled` | on | off | Lets the team check itself in inside the geofence |
| `hint_penalty` | -10 | 0 | Points charged per hint unlocked |
| `skip_penalty` | -25 | 0 | Points charged for giving up on a post |
| `participant_view_enabled` | on | off | Sends teams to `/team-progress` rather than the scoreboard |

All four are plain settings — any event can switch them on or off afterwards.

**Setting one up**

1. Create the event as `peddy_paper`.
2. Add checkpoints with coordinates, an arrival radius, and a **clue** — the
   riddle whose answer is that location. Leave the clue empty and the post shows
   "aguarda as indicações do guia" instead, which is how a guided event runs.
3. Optionally add **guide indications** per checkpoint, ordered vaguest first.
   They serve two purposes: a guide reads them out on arrival, and a stuck team
   can unlock them one at a time in the app for `hint_penalty` points each.
   Their `question`/`expected_answer` are guide-only and never sent to a team.
4. Optionally set **`start_offset_minutes`** per team (when editing a team) to
   stagger departures — same route for everyone, spread out in time so teams
   don't cluster at one post and copy each other. It shifts the team's start
   only; the event's end time is unchanged.

**The guide's app** (`/rally/guide`, guide/staff/admin roles) shows each post's
clue, guide indications, photos and fun facts, plus who has turned up:

- The route is **scoped to the guide's own assignment**, because in this mode
  the full route is the answer key and a phone showing every post is one glance
  over the shoulder from handing a team the rest of the game. Staff and admins
  see everything; a guide with no assignment also sees everything, since an
  admin who forgot to assign them would otherwise be left with a blank screen
  mid-event.
- **Marking a team as arrived** is the fallback for when GPS check-in fails —
  flat battery, no signal, an indoor post. The guide is the proof, so no
  geofence is checked; everything else (event window, cross-edition guard,
  idempotency, auto-complete for a no-activity post) behaves exactly like the
  GPS path, and the arrival is audited as `checkin.guide_arrival`.
- Indications a team **already unlocked in the app** are flagged, so the guide
  does not read out, for free, a hint the team just paid ten points for.

**When a team gets stuck**, the hint ladder eventually runs out and the riddle
is still unsolved. Rather than leave them at that post for the rest of the
event, they can **give up on it**: they pay `skip_penalty`, forfeit that post's
score, and receive the next clue. The forfeit is recorded in `checkpoint_skips`
and treated as *resolved, not completed* — which is what lets the route
continue even past a post whose activity nobody will ever judge.

**The loop:** the team reads the clue → walks → checks in by GPS inside the
radius → the post reveals itself (name, photos, fun facts) and the next clue
appears. GPS arrival is the only proof of arrival: there is no written answer to
submit and no photo evidence, by design.

**Planning a route before it is finished**

A peddy paper is written long before it is complete: some posts have a clue but
no challenge, some are still only a slot ("Bar 1") while somebody decides which
bar. The route model holds that state rather than forcing a finished post:

- **Draft posts** (`is_draft`) are invisible to every team-facing path — the
  route, the checkpoint count, the "next post" lookup and the guide's app all
  skip them. Publishing or drafting a post **renumbers** the route so published
  posts stay contiguous from 1, because progress is positional (`team.times` is
  indexed by order). For that same reason draft state **freezes once any team
  has checked in**: moving posts under a team mid-event would rewrite where it
  has been.
- **`staff_script`** is what whoever is stationed at the post should talk
  about, and **`challenge_brief`** is the challenge in prose before it becomes
  a configured Activity. Both are staff-only: the participant schema does not
  carry the fields at all, so they cannot leak through a team endpoint. The
  script is deliberately *not* a `CheckpointGuideIndication` — those are sold
  to teams as the paid hint ladder, so a briefing stored there would be
  purchasable.
- **`is_placeholder`** marks a name that is a stand-in, so the admin list can
  say "still to decide" instead of showing "Bar 1" as if it were settled.
- `GET /checkpoint/admin/route` is the planning view: every post including
  drafts, each with a `missing` list (`clue`, `coordinates`, `activity`,
  `staff`, `name`). What counts as missing follows the event's own settings —
  coordinates only matter with GPS check-in, a riddle only matters when the
  route is redacted.
- **Importing** *(planned, not built)*: a route is usually written in a
  spreadsheet or a Canva table before it is typed in — one line per post, with
  columns for the name, the staff script, the clue and the challenge, and cells
  reading "CF DECIDE" where nobody has decided yet. Pasting that table straight
  into the admin is the obvious next step; there is no import panel today, so
  posts are entered one at a time.

Two things worth knowing:

- The redaction is server-side. A redacted checkpoint comes back with
  `is_redacted: true`, a placeholder name, no coordinates, and the clue as its
  only real content — hiding it in the client would leave it in the payload.
- Hint charges are recorded as `DynamicAward` rows, not by decrementing
  `team.total`, because the scoring service recomputes totals from scratch. That
  also makes every charge visible and revocable in the admin.

## Concepts That Matter

- **Relative ranking:** Time-based activities assign points based on placement, not raw time.
- **Head-to-head safety:** Team-vs activities update both teams in a single transaction.
- **Editable evaluations:** Staff can adjust past results; checkpoint advancement logic handles it.
- **Caching:** The frontend uses TanStack Query + Zustand to avoid spamming the API.

## Deployment Notes

- Multi-stage Dockerfiles build both services (Python + nginx for the web)
- Auth flows reuse NEI JWT scopes (admin, rally manager, rally staff, etc.)
- All request payloads go through Pydantic validation

---

Questions?  
- Extension repo: https://github.com/NEI-AAUAV/Platform-rally-extension  
- Platform repo: https://github.com/NEI-AAUAV/Platform