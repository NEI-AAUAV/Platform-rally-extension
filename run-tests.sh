#!/bin/bash

# Test runner script for the standalone Rally extension.
# Runs both API (pytest) and frontend (vitest) test suites.
# Run this from the repository root (the directory containing this script).

set -e

echo "🧪 Running Rally Extension Tests"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Resolve repo root as the directory of this script, so the runner works
# regardless of the caller's current working directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

if [[ ! -f "api-rally/pyproject.toml" ]]; then
    print_error "Could not find api-rally/pyproject.toml. Run this script from the rally repo root."
    exit 1
fi

# --- Test environment ---------------------------------------------------------
# Tests need a TEAM_JWT_SECRET_KEY (config fails fast without one) and a real
# Postgres for the integration/scoring suite. Provide sane defaults so a fresh
# checkout runs green with one command; callers may override via env.
export TEAM_JWT_SECRET_KEY="${TEAM_JWT_SECRET_KEY:-test_secret}"
export POSTGRES_SERVER="${POSTGRES_SERVER:-localhost}"
export POSTGRES_USER="${POSTGRES_USER:-postgres}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
export POSTGRES_DB="${POSTGRES_DB:-rally}"  # config derives ${POSTGRES_DB}_test

# When RALLY_TEST_PG=managed (default), boot a throwaway Postgres via the test
# compose file and require it (no silent skips). Set RALLY_TEST_PG=external to
# reuse a Postgres you already have on $POSTGRES_SERVER, or =off to allow skips.
RALLY_TEST_PG="${RALLY_TEST_PG:-managed}"
TEST_COMPOSE="api-rally/docker-compose.test.yml"
PYTEST_PG_FLAG=""
COMPOSE_STARTED=""

compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

teardown_pg() {
    if [[ -n "$COMPOSE_STARTED" ]]; then
        echo "🧹 Stopping test Postgres..."
        compose_cmd -f "$TEST_COMPOSE" down -v >/dev/null 2>&1 || true
    fi
}
trap teardown_pg EXIT

if [[ "$RALLY_TEST_PG" == "managed" ]]; then
    echo "🐘 Starting test Postgres (compose)..."
    compose_cmd -f "$TEST_COMPOSE" up -d --wait postgres
    COMPOSE_STARTED=1
    PYTEST_PG_FLAG="--require-pg"
    # Create the derived ${POSTGRES_DB}_test database inside the compose container.
    compose_cmd -f "$TEST_COMPOSE" exec -T postgres \
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "CREATE DATABASE ${POSTGRES_DB}_test;" >/dev/null 2>&1 || true
elif [[ "$RALLY_TEST_PG" == "external" ]]; then
    PYTEST_PG_FLAG="--require-pg"
    # Ensure the derived ${POSTGRES_DB}_test database exists on the external PG.
    if command -v psql >/dev/null 2>&1; then
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_SERVER" -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" -c "CREATE DATABASE ${POSTGRES_DB}_test;" >/dev/null 2>&1 \
            || true
    fi
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."

if [[ ! -d "api-rally/.venv" ]]; then
    print_warning "Installing API dependencies..."
    # --no-root/--no-directory: never build this project or any path dependency
    # from source, so no setup scripts run. Deps resolve from committed
    # poetry.lock. (Sonar S8541 flags the poetry call itself; reviewed safe.)
    (cd api-rally && poetry install --no-interaction --no-root --no-directory)
fi

if [[ ! -d "web-rally/node_modules" ]]; then
    print_warning "Installing frontend dependencies..."
    (cd web-rally && pnpm install --frozen-lockfile --ignore-scripts)
fi

print_status "Dependencies installed"

# Run API tests
echo ""
echo "🐍 Running API Tests"
echo "==================="
if (cd api-rally && poetry run pytest app/tests/ -v $PYTEST_PG_FLAG --cov=app --cov-report=term-missing --cov-report=xml); then
    print_status "API tests passed"
else
    print_error "API tests failed"
    exit 1
fi

# Run frontend tests
echo ""
echo "⚛️  Running Frontend Tests"
echo "=========================="
if (cd web-rally && pnpm run test -- --run --coverage); then
    print_status "Frontend tests passed"
else
    print_error "Frontend tests failed"
    exit 1
fi

# Coverage summary
echo ""
echo "📊 Coverage Summary"
echo "=================="

if [[ -f "api-rally/coverage.xml" ]]; then
    echo "API Coverage:"
    grep -o 'line-rate="[^"]*"' api-rally/coverage.xml | head -1
fi

if [[ -f "web-rally/coverage/lcov.info" ]]; then
    echo "Frontend Coverage:"
    grep -o "LF:[0-9]*" web-rally/coverage/lcov.info | head -1
fi

echo ""
print_status "All tests completed successfully! 🎉"
echo ""
echo "📁 Test artifacts:"
echo "   - API coverage:      api-rally/coverage/"
echo "   - Frontend coverage: web-rally/coverage/"
echo "   - Test results:      api-rally/test-results.xml"
