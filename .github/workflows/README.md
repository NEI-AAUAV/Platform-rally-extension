# Rally Extension: CI Workflows

This guide provides an overview of the GitHub Actions workflows used to test and validate the Rally extension.

## Workflow Overview

Our CI is split into two primary workflows that run on pushes and pull requests to `main`.

### 1. `build-web.yml` - Web Artifact Generation

-   **Purpose:** To perform a clean build of the frontend application and generate a deployable `dist` artifact.
-   **Process:**
    1.  Generates the OpenAPI schema from the API source.
    2.  Installs `pnpm` dependencies (with caching).
    3.  Builds the React application.
    4.  Uploads the resulting `dist/` directory as a GitHub Actions artifact.

### 2. `docker-build.yml` - Dockerfile Validation

-   **Purpose:** To act as a quality gate by ensuring that the `Dockerfile` for both the API and web components can build successfully from source.
-   **Process:**
    1.  **API:** Builds the `dev` and `prod` Docker images for `api-rally` and runs a quick smoke test (`python -m compileall`).
    2.  **Web:** Builds the `dev` and `prod` Docker images for `web-rally`. This intentionally rebuilds from source to validate the entire Docker build process.
    3.  **Compose:** Validates the syntax of the `docker-compose` override files.

Other workflows for SonarQube analysis and code quality may also be present.

## Security: Automated Dependency Updates

This repository uses **Dependabot** to keep dependencies up to date.

-   It automatically creates pull requests for security patches and version updates.
-   It monitors Python, `pnpm`, Docker, and GitHub Actions dependencies.

Please review and merge Dependabot PRs promptly, especially those related to security vulnerabilities.

## Best Practices for Developers

### Before Pushing

We recommend running tests locally to catch issues early.

```bash
# Run backend tests
cd Platform/extensions/rally/api-rally
poetry run pytest

# Run frontend tests
cd Platform/extensions/rally/web-rally
pnpm test
```

### For Pull Requests

-   Ensure all workflow checks pass before requesting a review.
-   Address any warnings reported by the code quality and security scans.
-   Verify that your changes do not negatively impact test coverage.

## Troubleshooting Common Issues

-   **DB Connection Error in CI:** This may indicate the PostgreSQL service in Docker was not fully ready. Re-running the failed job often resolves this.
-   **pnpm/Poetry Lockfile Mismatch:** If a job fails due to a lockfile mismatch, run `pnpm install` or `poetry lock --no-update` locally and commit the updated lockfile.
-   **Stale Docker Cache:** If you suspect a stale cache is causing issues, you can manually clear the GitHub Actions cache from the "Actions" tab of the repository.