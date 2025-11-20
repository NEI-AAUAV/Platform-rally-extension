# Rally Extension

Rally is the NEI Platform’s competition module. It handles team rosters, checkpoint progress, activity scoring, staff evaluations, and public leaderboards. The extension is split into:

- `api-rally/` – FastAPI service (Python 3.11, SQLAlchemy, PostgreSQL)
- `web-rally/` – React/Vite frontend (TypeScript, Tailwind, Zustand)

## Directory Map

```
extensions/rally/
├── api-rally/
│   └── app/
│       ├── api/        # FastAPI routers
│       ├── crud/       # DB helpers
│       ├── models/     # SQLAlchemy models
│       └── services/   # Scoring + business logic
└── web-rally/
    └── src/
        ├── components/ # UI + themed parts
        ├── pages/      # Route-level screens
        ├── services/   # API client + hooks
        └── stores/     # Zustand state
```

## Local Setup

### Backend
```bash
cd Platform/extensions/rally/api-rally
poetry install
poetry run uvicorn app.main:app --reload
```
Set the usual `POSTGRES_*` env vars and point `JWT_PUBLIC_KEY_PATH` to the NEI key.

### Frontend
```bash
cd Platform/extensions/rally/web-rally
pnpm install
pnpm dev
```
The dev server proxies through the Platform compose stack, so run the backend first.

## Testing

```bash
# API
cd extensions/rally/api-rally
poetry run pytest

# Frontend
cd extensions/rally/web-rally
pnpm test
```
The backend test suite mocks the JWT verifier and spins up a temporary DB. Frontend tests run under Vitest/jsdom.

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
- Extension repo: https://github.com/NEI-AAUAV/Platform-rally-extension  
- Platform repo: https://github.com/NEI-AAUAV/Platform