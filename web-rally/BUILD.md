# Rally Web Build Guide

This guide explains how to build the Rally web frontend.

## Prerequisites

- **Node.js** 20+ (for `pnpm` and build tools)
- **pnpm** 9+ (package manager)
- **Python** 3.10+ with **Poetry** (to generate OpenAPI schema)
- **Docker** (optional, for building the artifact image)

## Quick Start (Local Development)

Use the provided build script:

```bash
cd Platform/extensions/rally/web-rally
./build-local.sh
```

This script:
1. Generates `openapi.json` from the api-rally app (offline, no DB)
2. Installs dependencies
3. Generates the API client (via prebuild hook)
4. Builds the frontend to `dist/`

## Manual Build Steps

### 1. Generate OpenAPI Schema

From `extensions/rally/api-rally/`:

```bash
# Install dependencies
poetry install --no-interaction --no-root --only main

# Generate schema
poetry run python - <<'PY'
from app.main import app
from fastapi.openapi.utils import get_openapi
import json, os

schema = get_openapi(
    title=getattr(app, 'title', 'API'),
    version=getattr(app, 'version', '0.0.0'),
    routes=app.routes,
)

out = os.path.join(os.path.dirname(__file__), '..', 'web-rally', 'openapi.json')
json.dump(schema, open(out, 'w'), indent=2)
print(f'Generated: {out}')
PY
```

**Or** fetch from a running API:

```bash
cd Platform/extensions/rally/web-rally
curl -fsSL 'https://your-api.example.com/openapi.json' -o openapi.json
```

### 2. Build Frontend

From `extensions/rally/web-rally/`:

```bash
# Install dependencies
pnpm install

# Build (prebuild generates client from openapi.json)
pnpm build
```

Output: `dist/` directory with static assets.

### 3. Build Docker Artifact Image (Optional)

From `extensions/rally/web-rally/`:

```bash
docker build -f Dockerfile.prod -t web-rally-artifact .
```

Output: Docker image with `/dist` containing the static assets.

## CI/CD (GitHub Actions)

The workflow `.github/workflows/build-web.yml`:

1. Generates OpenAPI schema offline (Python/Poetry)
2. Generates client (pnpm)
3. Builds frontend (pnpm)
4. Verifies `dist/` exists and is populated
5. Builds and pushes artifact-only image to GHCR:
   - `ghcr.io/nei-aauav/web-rally-artifact:<sha>`
   - `ghcr.io/nei-aauav/web-rally-artifact:latest`

## Deploying from Platform Repo

From the Platform repo (separate from Rally):

```bash
# Pull artifact image
docker pull ghcr.io/nei-aauav/web-rally-artifact:latest

# Extract dist
id=$(docker create ghcr.io/nei-aauav/web-rally-artifact:latest)
docker cp $id:/dist ./web-rally-dist
docker rm $id

# Deploy to nginx
rsync -a --delete ./web-rally-dist/ /var/www/rally/
```

## Troubleshooting

### Error: `openapi.json` not found

**Solution**: Generate the schema first (see step 1 above).

### Error: Docker build fails with "dist: not found"

**Causes**:
- Build context is wrong (must be `web-rally/`)
- `dist/` doesn't exist (run `pnpm build` first)

**Solution**:
```bash
cd Platform/extensions/rally/web-rally
ls -la dist  # Verify dist exists
docker build -f Dockerfile.prod -t test .
```

### Error: `COPY failed: file not found` in Dockerfile

**Solution**: Ensure:
- You're building from `web-rally/` directory
- `dist/` exists in `web-rally/`
- No `.dockerignore` is excluding `dist/`

## Architecture

```
Rally Repo (this repo)
├── api-rally/          # FastAPI backend
│   └── app/main.py     # OpenAPI source
└── web-rally/          # React frontend
    ├── openapi.json    # Generated schema (not committed)
    ├── src/client/     # Generated API client (not committed)
    ├── dist/           # Built static assets (not committed)
    └── Dockerfile.prod # Artifact-only image

Platform Repo (deployment)
└── (pulls and deploys ghcr.io/.../web-rally-artifact)
```

## Files

- **Dockerfile.prod**: Minimal `FROM scratch` image with only `/dist`
- **build-local.sh**: One-command local build script
- **package.json**: `"prebuild": "pnpm run generate-client"` hook
- **.gitignore**: Ignores `src/client/`, `openapi.json`, `dist/`
- **.github/workflows/build-web.yml**: CI pipeline

## Best Practices

✅ **Do**:
- Generate schema offline (no DB) for deterministic builds
- Build in CI before Docker image creation
- Use artifact-only Docker images for static sites
- Tag images with commit SHA for traceability

❌ **Don't**:
- Commit generated files (`src/client/`, `openapi.json`, `dist/`)
- Generate schema/client inside Docker (slow, brittle)
- Use large base images for static assets (nginx/node)

## Support

For issues, see:
- [Rally Extension Repo](https://github.com/NEI-AAUAV/Platform-rally-extension)
- [Platform Repo](https://github.com/NEI-AAUAV/Platform)

