# CI/CD Pipeline Documentation

## Overview

The Platform-rally-extension repository uses GitHub Actions for continuous integration and continuous deployment. This document describes the CI/CD workflows, their purposes, and how they work together.

**Note**: This repository is a git submodule of the main Platform repository. Deployment workflows are managed at the Platform repository level, not here.

## Workflows

### 1. Code Quality (`code-quality.yml`)

**Purpose**: Ensures code quality through linting, type checking, and security scanning.

**Triggers**:
- Push to `main` branch
- Pull requests to `main` branch
- Manual workflow dispatch

**Jobs**:

#### Python Linting & Type Checking
- **Formatting**: `black` (non-blocking)
- **Import sorting**: `isort` (non-blocking)
- **Linting**: `flake8` (non-blocking)
- **Type checking**: `mypy` (**BLOCKING**)

#### TypeScript Linting & Type Checking
- **Linting**: `ESLint` (non-blocking)
- **Type checking**: `tsc --noEmit` (**BLOCKING**)
- **Formatting**: `Prettier` (non-blocking)

#### Security Vulnerability Scan
- **Python**: `safety` check (non-blocking)
- **Node.js**: `npm audit` (non-blocking)

**Blocking Checks**: Type checking failures (mypy, TypeScript) will prevent merging.

### 2. Tests (`tests.yml`)

**Purpose**: Runs unit and integration tests for both API and frontend.

**Triggers**:
- Push to `main` branch (when `extensions/rally/**` paths change)
- Pull requests to `main` branch (when `extensions/rally/**` paths change)
- Manual workflow dispatch with test type selection

**Jobs**:

#### API Tests
- Runs pytest with PostgreSQL service
- Generates coverage reports
- Uploads test results and coverage artifacts

#### Frontend Tests
- Runs Vitest unit tests
- Generates coverage reports
- Uploads test results and coverage artifacts

#### Integration Tests
- Runs after API and frontend tests complete
- Tests full integration between API and frontend
- Uses shared test database

**Test Types** (via workflow_dispatch):
- `all`: Run all tests (default)
- `api`: Run only API tests
- `frontend`: Run only frontend tests
- `integration`: Run only integration tests

### 3. E2E Tests (`e2e-tests.yml`)

**Purpose**: Runs end-to-end tests using Playwright to verify user workflows.

**Triggers**:
- Push to `main` branch (when `web-rally/**` paths change)
- Pull requests to `main` branch (when `web-rally/**` paths change)
- Manual workflow dispatch

**Jobs**:

#### Playwright E2E Tests
- Generates OpenAPI schema from API
- Builds frontend application
- Installs Playwright browsers
- Runs E2E test suite
- Uploads test reports, videos, and screenshots on failure

**Test Coverage**:
- Staff evaluation workflows
- Admin pages
- Settings management
- Scoreboard functionality

### 4. Build Web Extension (`build-web.yml`)

**Purpose**: Builds the web extension and validates the build process.

**Triggers**:
- Push to `main` branch
- Pull requests to `main` branch
- Manual workflow dispatch

**Jobs**:

#### Build Rally Web Extension
- Generates OpenAPI schema from FastAPI application
- Installs frontend dependencies
- Generates API client from OpenAPI schema
- Builds frontend application
- Verifies build artifacts exist and are non-empty
- Builds and pushes Docker images to GHCR

**Artifacts**: Docker images published to `ghcr.io/nei-aauav/web-rally-artifact`

### 5. Docker Build Validation (`docker-build.yml`)

**Purpose**: Validates Docker images can be built and containers can start.

**Triggers**:
- Push to `main` branch (when Dockerfiles or dependencies change)
- Pull requests to `main` branch (when Dockerfiles change)
- Manual workflow dispatch

**Jobs**:

#### Build API Docker Image
- Builds development Docker image
- Builds production Docker image
- Tests that containers can start successfully

#### Build Web Docker Image
- Builds development Docker image
- Builds production Docker image
- Tests that containers can start successfully

#### Validate Docker Compose
- Validates `compose.override.yml` syntax
- Validates `compose.override.prod.yml` syntax
- Verifies service names match manifest.json

### 6. Validate Extension Manifest (`validate-manifest.yml`)

**Purpose**: Validates the extension manifest.json file structure and configuration.

**Triggers**:
- Push to `main` branch (when `manifest.json` changes)
- Pull requests to `main` branch (when `manifest.json` changes)
- Manual workflow dispatch

**Jobs**:

#### Validate manifest.json
- Validates JSON syntax
- Checks required fields (name, version, api.port, web.port)
- Verifies port uniqueness and valid ranges (1024-65535)
- Validates scopes structure (if defined)
- Validates navigation structure (if defined)
- Generates manifest summary

### 7. SonarQube Analysis (`sonar.yml`)

**Purpose**: Performs code quality analysis using SonarQube.

**Triggers**:
- After `tests.yml` workflow completes (on main branch)
- Pull requests to `main` branch
- Manual workflow dispatch

**Jobs**:

#### SonarQube Analysis
- Runs tests if needed (for PRs)
- Downloads test coverage artifacts
- Performs SonarQube code analysis
- Reports code quality metrics

**Note**: Requires `SONAR_HOST_URL` and `SONAR_TOKEN` secrets.

## Workflow Dependencies

```
┌─────────────────┐
│  Code Quality   │ (Independent)
└─────────────────┘

┌─────────────────┐
│     Tests       │ (Independent)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    SonarQube    │ (Depends on Tests)
└─────────────────┘

┌─────────────────┐
│  E2E Tests      │ (Independent)
└─────────────────┘

┌─────────────────┐
│  Build Web      │ (Independent)
└─────────────────┘

┌─────────────────┐
│ Docker Build    │ (Independent)
└─────────────────┘

┌─────────────────┐
│ Validate Manifest│ (Independent)
└─────────────────┘
```

## Status Checks

The following status checks must pass before merging:

### Required (Blocking)
- ✅ **Python Type Checking** (mypy) - Blocks on type errors
- ✅ **TypeScript Type Checking** (tsc) - Blocks on type errors
- ✅ **Build Rally Web Extension** - Blocks on build failures
- ✅ **API Tests** - Blocks on test failures
- ✅ **Frontend Tests** - Blocks on test failures
- ✅ **E2E Tests (Playwright)** - Blocks on E2E test failures
- ✅ **CodeQL Analysis** - Security analysis
- ✅ **Code scanning results** - Security scanning

### Optional (Non-blocking)
- ⚠️ **Python Linting** (black, isort, flake8) - Warnings only
- ⚠️ **TypeScript Linting** (ESLint, Prettier) - Warnings only
- ⚠️ **Security Vulnerability Scan** - Warnings only

## Deployment

**Important**: This repository is a git submodule of the main Platform repository. Deployment workflows are managed at the Platform repository level, not in this repository.

When changes are merged to `main`:
1. CI/CD checks run in this repository
2. The Platform repository tracks the submodule commit reference
3. Deployment is triggered from the Platform repository's CI/CD pipeline

## Troubleshooting

### Tests Fail Locally But Pass in CI
- Ensure you're using the same Python/Node versions
- Check that dependencies are installed correctly
- Verify database configuration matches CI setup

### Type Checking Fails
- Run `mypy app/` locally for Python issues
- Run `pnpm run type-check` locally for TypeScript issues
- Fix type errors before pushing

### E2E Tests Fail
- Check Playwright report artifacts
- Review test videos and screenshots
- Ensure API client is generated before running tests

### Build Fails
- Verify OpenAPI schema generation succeeds
- Check that all dependencies are installed
- Ensure `pnpm-lock.yaml` is up to date

## Best Practices

1. **Always run tests locally** before pushing
2. **Fix type errors** - they block merging
3. **Keep dependencies updated** - security scans will flag vulnerabilities
4. **Update tests** when adding new features
5. **Check CI status** before requesting reviews

## Workflow Maintenance

### Adding New Checks
1. Add the check to the appropriate workflow file
2. Determine if it should be blocking or non-blocking
3. Update this documentation
4. Test the workflow locally if possible

### Updating Dependencies
1. Update `poetry.lock` or `pnpm-lock.yaml`
2. Verify CI still passes
3. Check security scan results

### Modifying Test Configuration
1. Update test configuration files
2. Verify tests still run in CI
3. Check coverage reports are generated correctly

## Related Documentation

- [Testing Guide](./TESTING.md)
- [Extension Development Guide](./README.md)
- [Platform CI/CD Documentation](../../Platform/.github/workflows/README.md) (if exists)

