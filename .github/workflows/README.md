# Rally Extension CI/CD Workflows

This directory contains GitHub Actions workflows for the Rally extension. These workflows ensure code quality, security, and reliability.

## 📋 Workflow Overview

### 1. **tests.yml** - Comprehensive Testing
**Triggers:** Push to main, PRs, manual dispatch
**Purpose:** Runs unit, integration, and frontend tests

**Jobs:**
- `test-api`: Python/FastAPI tests with PostgreSQL
- `test-frontend`: React/TypeScript tests with coverage
- `test-integration`: End-to-end integration tests

**Key Features:**
- Parallel test execution for speed
- Coverage reporting (uploadable to SonarQube)
- Configurable test types via manual dispatch
- Cached dependencies for faster runs

### 2. **code-quality.yml** - Code Quality Checks ✨ NEW
**Triggers:** Push to main, PRs, manual dispatch
**Purpose:** Enforces code quality standards

**Jobs:**
- `lint-python`: Black, isort, flake8, mypy
- `lint-typescript`: ESLint, Prettier, TypeScript compiler
- `security-scan`: Dependency vulnerability checking

**Key Features:**
- Non-blocking (warnings don't fail builds)
- Runs in parallel with tests
- Provides actionable feedback

### 3. **build-web.yml** - Web Build Verification
**Triggers:** Push to main, PRs, manual dispatch
**Purpose:** Validates web app builds successfully

**Jobs:**
- `build-web-rally`: Generates OpenAPI client and builds React app

**Key Features:**
- Offline OpenAPI schema generation
- pnpm caching for speed
- Build artifact verification

### 4. **docker-build.yml** - Docker Image Validation ✨ NEW
**Triggers:** Dockerfile or dependency changes, manual dispatch
**Purpose:** Ensures Docker images build and start correctly

**Jobs:**
- `build-api-docker`: Builds dev & prod API images
- `build-web-docker`: Builds dev & prod web images
- `docker-compose-validation`: Validates compose files

**Key Features:**
- Tests both dev and production Dockerfiles
- Verifies containers actually start
- Uses GitHub Actions cache for layers
- Validates service naming matches manifest

### 5. **validate-manifest.yml** - Manifest Validation ✨ NEW
**Triggers:** Changes to manifest.json
**Purpose:** Ensures extension manifest is valid

**Checks:**
- JSON syntax validation
- Required fields (name, version, api.port, web.port)
- Port uniqueness and valid ranges
- Scopes structure
- Navigation entries structure
- Generates summary for PRs

### 6. **sonar.yml** - SonarQube Analysis
**Triggers:** Push to main, PRs, manual dispatch
**Purpose:** Code quality and security analysis

**Key Features:**
- Integrated with NEI's SonarQube instance
- Custom SSL certificate handling
- Quality gate enforcement
- Coverage integration

---

## 🔒 Security

### Dependabot Configuration
**File:** `.github/dependabot.yml` ✨ NEW

**What it does:**
- Automatically checks for dependency updates
- Creates PRs for security patches and updates
- Monitors 5 ecosystems:
  - Python (Poetry/pip)
  - npm/pnpm
  - GitHub Actions
  - Docker base images

**Schedule:**
- Dependencies: Weekly (Mondays)
- GitHub Actions: Monthly
- Docker images: Monthly

**Limits:**
- Max 5 open PRs for dependencies
- Max 3 open PRs for Actions/Docker
- Ignores major version updates for critical deps

---

## 🎯 Best Practices

### For Developers

1. **Before Pushing:**
   ```bash
   # Run tests locally
   cd api-rally && poetry run pytest
   cd web-rally && pnpm test
   
   # Check code quality
   cd api-rally && poetry run black . && poetry run mypy app/
   cd web-rally && pnpm run lint
   ```

2. **For Pull Requests:**
   - All workflows must pass (green checkmarks)
   - Code quality warnings should be addressed
   - Test coverage should not decrease

3. **Manual Workflows:**
   - Use `workflow_dispatch` to run workflows on-demand
   - `tests.yml` allows selecting specific test types
   - Useful for debugging CI issues

### For Maintainers

1. **Reviewing Dependabot PRs:**
   - Check CHANGELOG/release notes for breaking changes
   - Run tests locally if unsure
   - Merge security patches quickly

2. **Workflow Failures:**
   - Check job summaries for clear error messages
   - Look at artifact uploads for coverage reports
   - Re-run failed jobs if transient failure suspected

3. **Updating Workflows:**
   - Test changes on a branch first
   - Use `continue-on-error: true` for non-critical checks
   - Update this documentation when adding workflows

---

## 📊 Workflow Status Badges

Add these to your README.md:

```markdown
![Tests](https://github.com/NEI-AAUAV/rally/actions/workflows/tests.yml/badge.svg)
![Code Quality](https://github.com/NEI-AAUAV/rally/actions/workflows/code-quality.yml/badge.svg)
![Docker Build](https://github.com/NEI-AAUAV/rally/actions/workflows/docker-build.yml/badge.svg)
![SonarQube](https://github.com/NEI-AAUAV/rally/actions/workflows/sonar.yml/badge.svg)
```

---

## 🔧 Troubleshooting

### Common Issues

**Problem:** Tests fail with "Database connection error"
**Solution:** PostgreSQL service may not be ready. Add health checks or increase startup delay.

**Problem:** Docker build uses old cache
**Solution:** Manually clear GitHub Actions cache or add `--no-cache` flag temporarily.

**Problem:** SonarQube SSL certificate errors
**Solution:** The workflow handles this automatically. If persisting, check SONAR_HOST_URL secret.

**Problem:** pnpm lockfile mismatch
**Solution:** Run `pnpm install` locally and commit updated lockfile.

**Problem:** Poetry lockfile mismatch
**Solution:** Run `poetry lock --no-update` locally and commit updated lockfile.

---

## 🚀 Future Enhancements

Potential improvements to consider:

1. **Performance Testing:** Add k6 or Locust for load testing
2. **E2E Testing:** Playwright/Cypress for full browser tests
3. **Deployment Workflow:** Auto-deploy to staging on main push
4. **Release Automation:** Auto-create GitHub releases with changelogs
5. **Database Migration Testing:** Validate Alembic migrations
6. **API Contract Testing:** Validate OpenAPI schema compliance

---

## 📝 Workflow Maintenance

**Last Updated:** 2025-10-30
**Maintained By:** NEI Platform Team
**Review Schedule:** Quarterly

When updating workflows:
1. Test on feature branch first
2. Update this documentation
3. Notify team of changes
4. Monitor first production run

