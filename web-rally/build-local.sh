#!/usr/bin/env bash
set -euo pipefail

# Local development build script for Rally web
# Generates OpenAPI schema from api-rally (offline) and builds the frontend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALLY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$RALLY_DIR/api-rally"
WEB_DIR="$RALLY_DIR/web-rally"

echo "🚀 Rally Web Local Build"
echo "========================="

# Step 1: Generate OpenAPI schema from API
echo ""
echo "📋 Generating OpenAPI schema from api-rally..."
cd "$API_DIR"

if [ ! -f "pyproject.toml" ]; then
  echo "❌ Error: api-rally/pyproject.toml not found"
  exit 1
fi

# Install Poetry dependencies if needed
if ! poetry run python -c "import fastapi" 2>/dev/null; then
  echo "📦 Installing API dependencies with Poetry..."
  poetry install --no-interaction --no-root --only main
fi

# Generate schema offline (no DB required)
echo "🔧 Generating OpenAPI schema..."
poetry run python - <<'PY'
from app.main import app
from fastapi.openapi.utils import get_openapi
import json
import os

schema = get_openapi(
    title=getattr(app, 'title', 'Rally API'),
    version=getattr(app, 'version', '0.0.0'),
    routes=app.routes,
)

out_path = os.path.join(os.path.dirname(__file__), '..', 'web-rally', 'openapi.json')
with open(out_path, 'w') as f:
    json.dump(schema, f, indent=2)

print(f"✅ Generated schema: {out_path}")
PY

# Step 2: Build web frontend
echo ""
echo "🌐 Building web frontend..."
cd "$WEB_DIR"

if [ ! -f "openapi.json" ]; then
  echo "❌ Error: openapi.json was not generated"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --no-frozen-lockfile

# Build (prebuild hook will generate client from openapi.json)
echo "🔨 Building frontend (client will be generated via prebuild)..."
pnpm build

# Verify dist
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
  echo "❌ Error: dist/ is missing or empty"
  exit 1
fi

echo ""
echo "✅ Build successful!"
echo "   - OpenAPI schema: $WEB_DIR/openapi.json"
echo "   - Client generated: $WEB_DIR/src/client/"
echo "   - Build output: $WEB_DIR/dist/"
echo ""
echo "🐳 To build Docker artifact image:"
echo "   cd $WEB_DIR"
echo "   docker build -f Dockerfile.standalone -t web-rally-artifact ."

