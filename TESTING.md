# Rally Extension: Testing Guide

This guide provides a high-level overview of how to run tests for both the backend (`api-rally`) and frontend (`web-rally`) components of the Rally extension.

## Quick Start: Running All Tests

The most straightforward way to run all backend and frontend tests is to use the provided shell script from the repository root.

```bash
# From the rally repository root
./run-tests.sh
```

`run-tests.sh` is self-contained: it exports a default `TEAM_JWT_SECRET_KEY`
(config fails fast without one) and, by default, boots a throwaway Postgres via
`api-rally/docker-compose.test.yml` so the real-schema / scoring integration
tests actually run instead of silently skipping.

### Test environment / Postgres modes

Backend config requires `TEAM_JWT_SECRET_KEY`, and over half the backend suite
(scoring, integration, e2e) needs a real Postgres — those tests **skip** when
the DB is unreachable. Control the DB with `RALLY_TEST_PG`:

| `RALLY_TEST_PG` | Behaviour |
|-----------------|-----------|
| `managed` (default) | Boot + tear down a throwaway Postgres via compose; passes `--require-pg`. |
| `external` | Reuse the Postgres on `$POSTGRES_SERVER` (e.g. the dev `db_pg`, published on `localhost:5432` via `compose.override.yml`); passes `--require-pg`. |
| `off` | Run without Postgres; DB-backed tests skip. |

Running `pytest` directly:

```bash
# From api-rally/ — secret is mandatory; POSTGRES_DB=rally derives rally_test.
TEAM_JWT_SECRET_KEY=test_secret POSTGRES_DB=rally \
  poetry run pytest app/tests/ -v

# Fail (not skip) if Postgres is missing — what CI uses:
TEAM_JWT_SECRET_KEY=test_secret POSTGRES_DB=rally \
  poetry run pytest app/tests/ -v --require-pg
```

## Backend Testing (`api-rally`)

The API is tested with `pytest`.

-   **Test Location:** `api-rally/app/tests/`
-   **Stack:** Pytest, `pytest-cov`

**Run backend tests:**
```bash
# From api-rally/
poetry run pytest app/tests/ -v
```

**Run with coverage report:**
```bash
# From api-rally/
poetry run pytest app/tests/ --cov=app --cov-report=html
```

## Frontend Testing (`web-rally`)

The frontend uses Vitest for unit tests and Playwright for End-to-End (E2E) tests.

-   **Test Location (Unit):** `web-rally/tests/unit/`
-   **Test Location (E2E):** `web-rally/tests/e2e/`

**Run frontend tests:**
```bash
# From web-rally/

# Run all unit tests
pnpm test

# Run all E2E tests
pnpm test:e2e
```
> For a more detailed guide on frontend testing, including E2E architecture, mocking strategies, and debugging, see the **[Frontend Testing Guide](./web-rally/tests/TESTING.md)**.

## Coverage & SonarQube

Our test coverage strategy focuses on **business logic**. We intentionally exclude UI rendering components, generated code, and configuration files from SonarQube analysis to ensure that coverage metrics reflect test quality on critical code paths.

**Included in Coverage:**
- API endpoints and services
- Database CRUD operations
- Business logic in React hooks and stores
- Utility functions

**Excluded from Coverage:**
- UI component rendering (`*.tsx` components in `web-rally/src/components`)
- Auto-generated API client code
- Configuration files and test setup
