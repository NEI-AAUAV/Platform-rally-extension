# Rally Tascas

Rally is a self-contained competition platform for team-based checkpoint events. It handles team rosters, checkpoint progress, activity scoring, staff evaluations, and public leaderboards. It runs standalone — its own database, cache, API, web app, and reverse proxy — and authenticates staff against any Authentik (OIDC) instance. The project is split into:

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

- Repo: <https://github.com/NEI-AAUAV/Platform-rally-extension>