#!/bin/bash

# Test runner script for Rally Extension
# This script runs both API and frontend tests

set -e

echo "🧪 Running Rally Extension Tests"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "extensions/rally/api-rally/pyproject.toml" ]; then
    print_error "Please run this script from the Platform root directory"
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."

# API dependencies
if [ ! -d "extensions/rally/api-rally/.venv" ]; then
    print_warning "Installing API dependencies..."
    cd extensions/rally/api-rally
    poetry install
    cd ../../..
fi

# Frontend dependencies
if [ ! -d "extensions/rally/web-rally/node_modules" ]; then
    print_warning "Installing frontend dependencies..."
    cd extensions/rally/web-rally
    npm install
    cd ../../..
fi

print_status "Dependencies installed"

# Run API tests
echo ""
echo "🐍 Running API Tests"
echo "==================="
cd extensions/rally/api-rally

if poetry run pytest app/tests/ -v --cov=app --cov-report=term-missing; then
    print_status "API tests passed"
else
    print_error "API tests failed"
    exit 1
fi

cd ../../..

# Run frontend tests
echo ""
echo "⚛️  Running Frontend Tests"
echo "=========================="
cd extensions/rally/web-rally

if npm run test -- --run --coverage; then
    print_status "Frontend tests passed"
else
    print_error "Frontend tests failed"
    exit 1
fi

cd ../../..

# Generate coverage report
echo ""
echo "📊 Coverage Summary"
echo "=================="

if [ -f "extensions/rally/api-rally/coverage.xml" ]; then
    echo "API Coverage:"
    cat extensions/rally/api-rally/coverage.xml | grep -o 'line-rate="[^"]*"' | head -1
fi

if [ -f "extensions/rally/web-rally/coverage/lcov.info" ]; then
    echo "Frontend Coverage:"
    # Extract coverage percentage from lcov.info
    grep -o "LF:[0-9]*" extensions/rally/web-rally/coverage/lcov.info | head -1
fi

echo ""
print_status "All tests completed successfully! 🎉"
echo ""
echo "📁 Test artifacts:"
echo "   - API coverage: extensions/rally/api-rally/coverage/"
echo "   - Frontend coverage: extensions/rally/web-rally/coverage/"
echo "   - Test results: extensions/rally/api-rally/test-results.xml"

