# Rally Extension

The Rally extension provides checkpoint-based competition management for NEI events. It covers team registration, checkpoint operations, activity evaluation, scoring, and live rankings. The system is split into a FastAPI backend and a React/TypeScript frontend.

## Overview

Core capabilities:
- Team and member management
- Checkpoint assignment and progress tracking
- Activity configuration (time-based, score-based, boolean, and head‑to‑head)
- Staff evaluation workflows with permission checks
- Scoring with penalties/bonuses and relative ranking for time‑based activities
- Public leaderboard and team views

## Architecture

Components:
- Backend (`api-rally`): FastAPI, SQLAlchemy, PostgreSQL, Pydantic
- Frontend (`web-rally`): React 18 + TypeScript, Vite, Tailwind, Zustand, TanStack Query

Selected folders:
```
api-rally/app/
  api/         # API routes
  core/        # settings, auth
  crud/        # persistence layer
  models/      # domain models
  schemas/     # request/response contracts
  services/    # scoring and domain services
  tests/       # unit, API, and integration tests

web-rally/src/
  components/  # UI components
  pages/       # screens
  services/    # API client
  stores/      # state management
  client/      # generated API models
```

## Development

Backend:
```bash
cd Platform/extensions/rally/api-rally
poetry install
poetry run uvicorn app.main:app --reload
```

Frontend:
```bash
cd Platform/extensions/rally/web-rally
npm install
npm run dev
```

Configuration (backend):
- `POSTGRES_*` variables for database access
- `JWT_PUBLIC_KEY_PATH` and `JWT_ALGORITHM` for authentication

## Testing

Backend tests:
```bash
cd Platform/extensions/rally/api-rally
poetry run pytest
```

Frontend tests:
```bash
cd Platform/extensions/rally/web-rally
npm run test
```

Notes:
- Tests rely on `orjson`. It is declared in `pyproject.toml`.
- Tests mock the JWT public key read at import time to avoid filesystem coupling in CI.

## API

Base path: `/api/rally/v1`

Examples:
- `GET /teams` — list teams
- `GET /checkpoints` — list checkpoints
- `GET /activities` — list activities
- `POST /activities` — create activity
- `POST /staff/evaluate` — submit staff evaluation for an activity

Refer to the OpenAPI schema exposed by the backend for the full surface.

## Implementation details

- Time-based activities use relative ranking. Ties are handled correctly, and last‑place logic avoids awarding minimum points to non‑last ranks.
- Staff evaluation endpoints permit updating existing results even if a team has progressed past the staff’s checkpoint, provided the activity belongs to that checkpoint.
- Team‑vs‑team creation batches both results and performs a single recalculation to ensure ranking consistency.
- Frontend caches common queries (for example, settings) to reduce unnecessary requests.
- TypeScript client models are kept in sync with backend responses (e.g., `ListingTeam.last_checkpoint_name`).

## Security

- JWT authentication integrated with the platform
- Attribute/role checks on staff endpoints
- Input validation with Pydantic schemas

## Deployment

Container builds are provided for backend and frontend. Nginx reverse proxy configs are available in the repository to support production deployments, static asset serving, and TLS termination.
