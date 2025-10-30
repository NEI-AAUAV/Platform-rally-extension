# Rally Web Build Guide

This guide explains how to build the Rally web frontend.

## Two Deployment Modes

### Mode 1: Platform Submodule (Recommended for Platform repo)

Rally is a submodule of Platform. Use the multi-stage `Dockerfile.prod`.

**Build context:** `extensions/rally/` (parent of web-rally and api-rally)

```bash
# From Platform root
docker compose -f compose.prod.yml build web_rally
```

The Dockerfile will:
1. Generate OpenAPI schema from api-rally (Python stage)
2. Generate client and build web (Node stage)
3. Serve with nginx on port 3003 (nginx stage)

### Mode 2: Standalone CI Build (For Rally repo CI)

Rally repo can publish pre-built static artifacts (no nginx) to GHCR for external deployment.

**Build context:** `web-rally/` (dist must already exist)

```bash
# Generate schema and build first
cd extensions/rally/web-rally
./build-local.sh

# Then build artifact-only image (no nginx, just files)
docker build -f Dockerfile.standalone -t web-rally-artifact .
```

**Note:** Platform deployment uses `Dockerfile.prod` (with nginx), not the artifact image.

## Prerequisites

- **Docker** 20+ with BuildKit
- **For local builds**: Node 20+, pnpm 9+, Python 3.11+, Poetry

## Local Development Build

### Quick Start Script

```bash
cd Platform/extensions/rally/web-rally
./build-local.sh
```

This script:
1. Generates `openapi.json` from api-rally (offline, no DB)
2. Installs dependencies
3. Generates API client (via prebuild hook)
4. Builds frontend to `dist/`

### Manual Steps

#### 1. Generate OpenAPI Schema

From `extensions/rally/api-rally/`:

```bash
poetry install --no-root --only main
poetry run python - <<'PY'
from app.main import app
from fastapi.openapi.utils import get_openapi
import json, os

schema = get_openapi(
    title=getattr(app, 'title', 'Rally API'),
    version=getattr(app, 'version', '0.0.0'),
    routes=app.routes,
)

out = os.path.join(os.path.dirname(__file__), '..', 'web-rally', 'openapi.json')
json.dump(schema, open(out, 'w'), indent=2)
print(f'Generated: {out}')
PY
```

#### 2. Build Frontend

From `extensions/rally/web-rally/`:

```bash
pnpm install
pnpm build  # prebuild generates client from openapi.json
```

Output: `dist/` with static assets

## Docker Builds

### Platform Compose (Production)

```bash
# From Platform root
docker compose -f compose.prod.yml build web_rally
docker compose -f compose.prod.yml up -d web_rally
```

### Standalone Artifact Image

```bash
# After building web locally
cd extensions/rally/web-rally
docker build -f Dockerfile.standalone -t rally-artifact .
```

### Extract Static Files (from artifact image)

If you need just the static files (e.g., for external nginx):

```bash
# Extract dist from artifact-only image
id=$(docker create rally-artifact)
docker cp $id:/dist ./rally-static
docker rm $id

# Deploy to external nginx
rsync -a --delete ./rally-static/ /var/www/html/rally/
```

**Note:** Platform doesn't use this - it runs nginx inside the container.

## Platform CI/CD Integration

### Option A: Build in Docker (Current Setup)

Platform's `compose.prod.yml` builds Rally web using multi-stage Dockerfile with nginx.

**Pros:** 
- All-in-one build, no separate steps
- Nginx serves files directly from container
- Consistent with web_nei/web_gala pattern

**Cons:** 
- Longer build time (includes schema gen + web build)
- Larger image (includes nginx)

### Option B: Pre-build in CI (Faster)

Generate schema and build in CI, then package with Docker:

```yaml
# .github/workflows/deploy.yml
- name: Checkout with submodules
  uses: actions/checkout@v4
  with:
    submodules: recursive

- name: Build Rally Web
  run: |
    cd extensions/rally/web-rally
    ./build-local.sh

- name: Package artifact
  run: |
    cd extensions/rally/web-rally
    docker build -f Dockerfile.standalone -t rally-artifact .
```

## Rally CI (Separate Repo)

Rally repo workflow publishes artifacts to GHCR:

```yaml
# .github/workflows/build-web.yml
# Generates schema → builds web → publishes artifact
# Output: ghcr.io/nei-aauav/web-rally-artifact:latest
```

Platform can then consume:

```bash
docker pull ghcr.io/nei-aauav/web-rally-artifact:latest
# Extract and deploy
```

## Troubleshooting

### Error: `openapi.json` not found during build

**Cause:** Schema generation failed or wrong build context

**Solution:**
- Ensure build context includes both `api-rally/` and `web-rally/`
- Check Python stage logs for schema generation errors

### Error: `pnpm install` fails with frozen lockfile

**Solution:** Dockerfile uses fallback:
```dockerfile
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
```

### Error: Docker build can't find api-rally sources

**Cause:** Build context doesn't include parent directory

**Solution:**
```yaml
# compose.override.prod.yml
build:
  context: extensions/rally  # Parent directory
  dockerfile: web-rally/Dockerfile.prod
```

### Build is very slow in Platform

**Solution:** Use CI pre-build approach (Option B above)

## File Overview

```
extensions/rally/
├── api-rally/              # FastAPI backend
│   └── app/main.py         # OpenAPI source
└── web-rally/              # React frontend
    ├── Dockerfile.prod     # Multi-stage (Platform builds)
    ├── Dockerfile.standalone  # Artifact-only (CI builds)
    ├── build-local.sh      # Local dev script
    ├── openapi.json        # Generated (not committed)
    ├── src/client/         # Generated (not committed)
    └── dist/               # Built assets (not committed)
```

## Best Practices

✅ **Platform Submodule:**
- Use multi-stage `Dockerfile.prod`
- Build context = `extensions/rally/`
- One workflow, no external dependencies

✅ **Rally Standalone Repo:**
- Build in CI with `build-local.sh`
- Publish artifact to GHCR
- Platform pulls and deploys

✅ **Both:**
- Never commit generated files (`openapi.json`, `src/client/`, `dist/`)
- Generate schema offline (no DB required)
- Use prebuild hook for client generation

## Support

- Rally Extension: https://github.com/NEI-AAUAV/Platform-rally-extension
- Platform: https://github.com/NEI-AAUAV/Platform
