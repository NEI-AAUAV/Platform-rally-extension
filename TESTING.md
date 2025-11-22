# Rally Extension: Testing Guide

This guide provides a high-level overview of how to run tests for both the backend (`api-rally`) and frontend (`web-rally`) components of the Rally extension.

## Quick Start: Running All Tests

The most straightforward way to run all backend and frontend tests is to use the provided shell script from the repository root.

```bash
# From the Platform repository root
./Platform/extensions/rally/run-tests.sh
```

## Backend Testing (`api-rally`)

The API is tested with `pytest`.

-   **Test Location:** `api-rally/app/tests/`
-   **Stack:** Pytest, `pytest-cov`

**Run backend tests:**
```bash
# From Platform/extensions/rally/api-rally
poetry run pytest app/tests/ -v
```

**Run with coverage report:**
```bash
# From Platform/extensions/rally/api-rally
poetry run pytest app/tests/ --cov=app --cov-report=html
```

## Frontend Testing (`web-rally`)

The frontend uses Vitest for unit tests and Playwright for End-to-End (E2E) tests.

-   **Test Location (Unit):** `web-rally/tests/unit/`
-   **Test Location (E2E):** `web-rally/tests/e2e/`

**Run frontend tests:**
```bash
# From Platform/extensions/rally/web-rally

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
