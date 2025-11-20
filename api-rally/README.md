# api-rally (Rally backend)

FastAPI service that powers the Rally extension: teams, checkpoints, activities, staff evaluations, and scoring logic.

## Stack

| Piece       | Tech                                     |
|-------------|-------------------------------------------|
| Runtime     | Python 3.11 + FastAPI                     |
| Database    | PostgreSQL (SQLAlchemy + Alembic)         |
| Auth        | JWT (shared with NEI Platform scopes)     |
| Packaging   | Poetry                                    |
| Tests       | Pytest + HTTPX test client                |

## Requirements

- Python 3.11
- PostgreSQL (local or Docker)
- OpenSSL keys for JWT validation (`JWT_PUBLIC_KEY_PATH`, `JWT_PRIVATE_KEY_PATH`)

Create a `.env` (or export vars) with at least:
```bash
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=nei_rally
POSTGRES_USER=nei
POSTGRES_PASSWORD=secret
JWT_PUBLIC_KEY_PATH=/path/to/public.pem
JWT_PRIVATE_KEY_PATH=/path/to/private.pem
```

## Install & Run

```bash
cd Platform/extensions/rally/api-rally
poetry install
poetry run uvicorn app.main:app --reload --port 8003
```

The service exposes:
- REST API under `/api/rally/v1`
- Interactive docs at `/docs`
- OpenAPI JSON at `/openapi.json` (used by `web-rally` to generate its client)

## Tests

```bash
poetry run pytest app/tests -v
poetry run pytest app/tests --cov=app --cov-report=html
```

Pytest fixtures spin up an in-memory database and stub JWT verification, so no external dependencies are required.

## Useful Commands

```bash
poetry run alembic upgrade head    # apply DB migrations
poetry run uvicorn app.main:app    # production-style run (set env vars first)
poetry export -f requirements.txt  # used by Dockerfile.prod
```

## Directory Map

```
api-rally/
├── app/
│   ├── api/             # FastAPI routers (v1 endpoints, auth deps)
│   ├── core/            # config, logging, ABAC helpers
│   ├── crud/            # reusable DB operations
│   ├── models/          # SQLAlchemy models (see activities docs below)
│   ├── schemas/         # Pydantic models
│   ├── services/        # business logic (scoring, rally duration)
│   └── tests/           # unit + integration suites
├── Dockerfile           # dev image (hot reload)
├── Dockerfile.prod      # multi-stage production build (gunicorn + uvicorn worker)
└── ACTIVITY_SCORING.md  # scoring rules for each activity type
```

For deeper details on how activities are scored, check `app/models/activities/ACTIVITY_SCORING.md`.

## Notes

- The service expects to run behind the NEI Platform gateway, so auth scopes (`rally-staff`, `manager-rally`, etc.) come from the main platform JWT.
- When building `web-rally`, run `web-rally/build-local.sh` to regenerate `openapi.json` from this service without hitting a live database.

