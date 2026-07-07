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

# Install dependencies if needed
echo "📦 Installing dependencies..."

if [[ ! -d "api-rally/.venv" ]]; then
    print_warning "Installing API dependencies..."
    (cd api-rally && poetry install --no-interaction)
fi

if [[ ! -d "web-rally/node_modules" ]]; then
    print_warning "Installing frontend dependencies..."
    (cd web-rally && pnpm install --frozen-lockfile)
fi

print_status "Dependencies installed"

# Run API tests
echo ""
echo "🐍 Running API Tests"
echo "==================="
if (cd api-rally && poetry run pytest app/tests/ -v --cov=app --cov-report=term-missing --cov-report=xml); then
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
