# Rally Web: Build Guide

This guide covers building, testing, and deploying the Rally web frontend.

## Build Methods

There are two primary ways to build the Rally web assets.

### 1. Local Development (Recommended)

The `build-local.sh` script is the fastest way to build the assets. It handles OpenAPI schema generation, dependency installation, and client generation.

```bash
# From Platform/extensions/rally/web-rally
./build-local.sh
```

This generates the final assets in the `web-rally/dist/` directory.

### 2. Platform Docker Build

This method builds the web assets inside a Docker container as part of the main platform's `docker compose` workflow. This is how production images are built.

```bash
# From the Platform repository root
docker compose -f compose.prod.yml build web_rally
docker compose -f compose.prod.yml up -d web_rally
```

The build is defined in `web-rally/Dockerfile.prod`, which is a multi-stage Dockerfile that performs the same steps as the local script.

## Deploying Static Assets

After running `./build-local.sh`, you can deploy the static files from the `dist/` directory to any static hosting service or web server.

**Package into a tarball:**
```bash
tar -czf rally-web.tar.gz -C web-rally/dist .
```

**Deploy with rsync:**
```bash
rsync -a --delete web-rally/dist/ user@your-server:/var/www/html/rally/
```

## CI/CD Workflows

The Rally extension uses two distinct CI workflows for quality and deployment.

1.  **`build-web.yml` (Artifact Generation):**
    *   **Purpose:** To create the official, deployable `dist` artifact.
    *   **Process:** Runs the `./build-local.sh` script and uploads the resulting `dist` directory as a GitHub Actions artifact.

2.  **`docker-build.yml` (Validation):**
    *   **Purpose:** To act as a CI quality gate, ensuring that the Dockerfiles can build the services from source.
    *   **Process:** This workflow intentionally rebuilds from source to catch any breaks in the Docker build process itself. It does *not* use the artifact from `build-web.yml`.

## Core Concepts

*   **Build Context:** Building via the platform (`docker compose`) requires the build context to be the repository root, as the web Dockerfile needs access to `api-rally/` to generate the OpenAPI schema.
*   **Generated Files:** Never commit generated files to Git. This includes `openapi.json`, `src/client/`, and the `dist/` directory.
*   **Offline Schema:** The OpenAPI schema is generated offline from the FastAPI application code, so no database connection is required during the build.

## Troubleshooting

*   **`openapi.json` is missing:** Ensure the Docker build context includes the `api-rally/` directory.
*   **`pnpm` failures:** Lockfile mismatches are handled automatically by the build scripts.
*   **Slow Platform builds:** This is expected, as the validation workflow rebuilds from source. The artifact-generation workflow (`build-web.yml`) is much faster.

## File Structure

```
extensions/rally/
├── api-rally/      # FastAPI backend (source for schema)
└── web-rally/      # React frontend
    ├── Dockerfile        # For local development container
    ├── Dockerfile.prod   # Multi-stage production build (includes nginx)
    ├── build-local.sh    # Main build script for local use and CI
    └── dist/             # (Generated) Final static assets
```

## Links

*   **Rally Repo:** `https://github.com/NEI-AAUAV/Platform-rally-extension`
*   **Platform Repo:** `https://github.com/NEI-AAUAV/Platform`