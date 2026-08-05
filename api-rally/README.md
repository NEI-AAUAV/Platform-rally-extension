# api-rally (Rally backend)

FastAPI service that powers the Rally extension: teams, checkpoints, activities, staff evaluations, badges, and scoring logic.

## Stack

| Piece       | Tech                                       |
|-------------|---------------------------------------------|
| Runtime     | Python 3.12 + FastAPI                       |
| Database    | PostgreSQL (SQLAlchemy 2.0 async + Alembic) |
| Auth        | OIDC (authentik) for users, HS256 team tokens for team-code login |
| Packaging   | Poetry                                      |
| Tests       | Pytest + HTTPX/FastAPI TestClient, against real Postgres |
| Lint/format | ruff, mypy (strict), import-linter          |

## Requirements

- Python 3.12
- PostgreSQL (local or Docker — `docker compose -f docker-compose.test.yml up -d` for a throwaway instance)
- An OIDC provider (authentik in production; `scripts/smoke/fake_oidc_provider.py` for local/smoke testing)

Create a `.env` (or export vars) with at least:
```bash
POSTGRES_SERVER=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=rally
OIDC_PROVIDER_URL=https://your-authentik-instance
OIDC_CLIENT_ID=rally
TEAM_JWT_SECRET_KEY=some-random-secret   # signs the team-code login token
```
See `app/core/config.py` for the full settings surface (CORS, Redis/realtime, R2 storage, rate limits, etc.).

## Install & Run

```bash
cd api-rally
poetry install
poetry run uvicorn app.main:app --reload --port 8082
```

The service exposes:
- REST API under `/api/rally/v1`
- Interactive docs at `/docs`
- OpenAPI JSON at `/openapi.json` — regenerate the committed copy at `web-rally/openapi.json` with
  `poetry run python scripts/generate_openapi.py` whenever an endpoint's shape changes (CI enforces this stays in sync).
- Liveness probe at `/health` (container healthcheck target; root path, not proxied publicly)
- Readiness probe at `/api/rally/v1/health/ready` — under the versioned prefix because only
  `/api/rally/...` is proxied through to this service in production
- Prometheus scrape at `/metrics` — unauthenticated, deliberately left off the public routes;
  the admin panel reads the same counters through `/api/rally/v1/admin/metrics` (admin only)

## Tests

```bash
poetry run pytest app/tests -v
poetry run pytest app/tests --cov=app --cov-report=html
```

The suite runs against a **real Postgres schema**, not an in-memory stub (models use Postgres-only
`ARRAY` columns, so SQLite can't represent them). `pg_session`/`pg_client` fixtures in
`app/tests/conftest.py` drop and recreate the schema per test. Auth is bypassed via
`app.dependency_overrides` (`as_admin`/`as_user`/`as_team` fixtures) rather than minting real tokens.

Pass `--require-pg` to fail loudly instead of skipping when Postgres is unreachable (this is what CI
does); locally, tests needing Postgres just skip if it's not running. See `TESTING.md` at the repo root
for the `RALLY_TEST_PG` modes (`managed`/`external`/`off`).

## Useful Commands

```bash
poetry run alembic upgrade head       # apply DB migrations
poetry run ruff format app/ && poetry run ruff check app/   # format + lint
poetry run mypy app/                  # strict type check
poetry run lint-imports                # enforce the layering contract (see below)
poetry export -f requirements.txt      # used by Dockerfile.prod
```

## Architecture

Each domain (team, checkpoint, activity, badge, user, ...) owns a `router → service → crud → models`
chain, similar to a Spring Boot `Controller → Service → Repository → Entity` layering:

| Layer | Role | Location |
|---|---|---|
| Controller | Thin FastAPI route functions: auth/ABAC checks, request/response shaping, delegates everything else | `app/api/api_v1/<domain>.py` |
| Service | Business rules, validation, orchestration, the transaction boundary | `app/services/<domain>_service.py` |
| Repository | Data access only (`CRUDBase` subclasses, or a hand-rolled class for models that don't fit the generic shape) | `app/crud/crud_<domain>.py` |
| Entity | SQLAlchemy models, including derived `@property` getters and mutator methods that keep invariants (e.g. `Team.record_checkpoint`) | `app/models/<domain>.py` |
| DTO | Pydantic request/response schemas | `app/schemas/<domain>.py` |

A service is constructed with its collaborators (`TeamService(db, team_crud)`), not a module-level
singleton — the closest FastAPI equivalent to constructor injection. Repositories (`crud.team`,
`crud.checkpoint`, ...) remain module-level singletons re-exported from `app/crud/__init__.py`, since
they're stateless and widely shared.

**Layering is enforced, not just documented.** `pyproject.toml`'s `[tool.importlinter]` section
forbids `app.core`/`app.utils` from importing any domain package; run `poetry run lint-imports` to
check it (also wired into CI). A handful of pre-existing violations are allowlisted via
`ignore_imports` — fix them rather than widening that list.

**Two modules are deliberately still free-function style, not classes:** `app/api/api_v1/
staff_evaluation_utils.py` and `app/services/badge_service.py`. Both are monkeypatched by name in
~20+ tests (`monkeypatch.setattr(module, "some_function", ...)`), which only works for plain module
functions, not bound methods on a class instance. Converting them would require rewriting those tests
too — left as free functions on purpose, not an oversight.

## Directory Map

```
api-rally/
├── app/
│   ├── api/               # Controllers: routers, auth deps, ABAC checks
│   │   └── api_v1/        # one module per domain — thin, delegates to services
│   ├── core/               # config, logging, exceptions, ABAC policy, Redis
│   ├── crud/               # Repositories: CRUDBase + per-domain data access
│   ├── db/                 # engine/session, migration bootstrap, seed data
│   ├── models/              # SQLAlchemy entities (see activities docs below)
│   │   └── activities/     # Strategy classes for scoring, NOT ORM tables
│   ├── schemas/             # Pydantic DTOs
│   ├── services/            # Business logic — one class per domain (see Architecture)
│   ├── events/              # Redis pub/sub: typed domain events
│   ├── workers/             # Background workers (scoring, leaderboard, badges)
│   └── tests/               # unit / crud / api / integration suites
├── alembic/                 # DB migrations
├── scripts/                  # OpenAPI generation, smoke-test harness
├── Dockerfile               # dev image (hot reload)
├── Dockerfile.prod          # multi-stage production build (uvicorn with workers)
└── ACTIVITY_SCORING.md      # scoring rules for each activity type
```

For deeper details on how activities are scored, check `app/models/activities/ACTIVITY_SCORING.md`.

## Notes

- Auth has two independent paths: NEI/staff users authenticate via OIDC bearer tokens validated
  against the configured provider's JWKS (`app/api/oidc.py`); teams can also log in with a short
  access code, which mints an HS256 token signed with `TEAM_JWT_SECRET_KEY` (`app/api/api_v1/team_auth.py`).
- Real-time features (live scoreboard, SSE streams, background workers) are gated behind
  `EVENTS_ENABLED` and require Redis.
- When building `web-rally`, run `pnpm run generate-client` after any API change so its generated
  TypeScript client stays in sync with `openapi.json`.
