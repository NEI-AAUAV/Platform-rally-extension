# Rally Extension Testing Guide

This document describes the testing strategy and setup for the Rally Extension.

## Overview

The Rally Extension uses a comprehensive testing approach that covers both API (Python/FastAPI) and frontend (React/TypeScript) components, focusing on business logic while excluding UI components from SonarQube analysis.

## Test Structure

### API Tests (`api-rally/app/tests/`)

- **`test_api.py`**: Integration tests for API endpoints
- **`test_crud.py`**: Unit tests for CRUD operations and business logic
- **`conftest.py`**: Test configuration and fixtures

### Frontend Tests (`web-rally/src/test/`)

- **`timezone.test.ts`**: Tests for timezone utility functions
- **`useRallySettings.test.tsx`**: Tests for Rally settings hook
- **`useUserStore.test.ts`**: Tests for user store (Zustand)

## Test Categories

### 1. Business Logic Tests (Included in SonarQube)

- **API Endpoints**: Team management, rally settings, checkpoint operations
- **CRUD Operations**: Database operations and validation
- **Utility Functions**: Timezone handling, duration calculations
- **Hooks**: Custom React hooks for data fetching
- **Stores**: State management logic

### 2. Component Tests (Excluded from SonarQube)

- **UI Components**: Button, Card, Alert, etc.
- **Shared Components**: Team cards, navigation tabs
- **Theme Components**: Bloody theme components
- **Generated Code**: API client code

## Running Tests

### Quick Test Run

```bash
# From Platform root directory
./extensions/rally/run-tests.sh
```

### Individual Test Suites

#### API Tests

```bash
cd extensions/rally/api-rally
poetry run pytest app/tests/ -v --cov=app
```

#### Frontend Tests

```bash
cd extensions/rally/web-rally
npm run test
```

### Test with Coverage

```bash
# API with coverage
cd extensions/rally/api-rally
poetry run pytest app/tests/ --cov=app --cov-report=html

# Frontend with coverage
cd extensions/rally/web-rally
npm run test:coverage
```

## Test Configuration

### API Test Configuration (`pytest.ini`)

- **Coverage**: Minimum 80% coverage required
- **Reports**: HTML, XML, and terminal output
- **Markers**: `slow`, `integration`, `unit`
- **Warnings**: Deprecation warnings filtered

### Frontend Test Configuration (`vitest.config.ts`)

- **Environment**: jsdom for DOM testing
- **Coverage**: v8 provider with HTML/JSON reports
- **Setup**: Custom test setup with mocks
- **Aliases**: `@` alias for src directory

### SonarQube Configuration (`sonar-project.properties`)

- **Exclusions**: UI components, generated code, dependencies
- **Inclusions**: Business logic files only
- **Coverage**: Excludes test files and UI components
- **Focus**: API endpoints, CRUD operations, utilities, hooks

## Test Coverage Goals

### API Coverage (Target: 80%+)

- ✅ Rally settings CRUD operations
- ✅ Team member management
- ✅ Checkpoint validation logic
- ✅ Timezone handling
- ✅ Rally duration calculations
- ✅ Authentication and authorization

### Frontend Coverage (Target: 70%+)

- ✅ Timezone utility functions
- ✅ Custom hooks (useRallySettings)
- ✅ State management (useUserStore)
- ✅ Form validation logic
- ✅ API service calls

## Excluded from Coverage

- UI component rendering
- Generated API client code
- Configuration files
- Test files themselves
- Migration files
- Build artifacts

## Test Data and Fixtures

### API Fixtures

- **`test_settings`**: Rally settings with default values
- **`test_team`**: Sample team for testing
- **`test_user`**: Sample user for testing
- **`db_session`**: Fresh database for each test

### Frontend Mocks

- **`mockFetch`**: Mocked fetch API
- **`mockLocalStorage`**: Mocked localStorage
- **`mockConsole`**: Suppressed console output
- **React Query**: Test wrapper with QueryClient

## Continuous Integration

### Pre-commit Hooks

```bash
# Run tests before commit
./extensions/rally/run-tests.sh
```

### SonarQube Integration

- Tests run automatically on PR
- Coverage reports uploaded
- Quality gate enforced
- Component files excluded from analysis

## Debugging Tests

### API Test Debugging

```bash
cd extensions/rally/api-rally
poetry run pytest app/tests/test_api.py::TestRallySettings::test_get_rally_settings_public -v -s
```

### Frontend Test Debugging

```bash
cd extensions/rally/web-rally
npm run test -- --reporter=verbose timezone.test.ts
```

## Best Practices

### API Testing

1. Use fixtures for common test data
2. Mock external dependencies
3. Test both success and error cases
4. Verify database state changes
5. Use descriptive test names

### Frontend Testing

1. Mock API calls and external dependencies
2. Test hook behavior with different states
3. Verify state updates and side effects
4. Test error handling and edge cases
5. Use React Testing Library best practices

### General

1. Keep tests focused and atomic
2. Use meaningful assertions
3. Clean up after tests
4. Avoid testing implementation details
5. Focus on business logic over UI details

## Troubleshooting

### Common Issues

1. **Database conflicts**: Each test gets a fresh database
2. **Async operations**: Use `waitFor` for React Query tests
3. **Mock cleanup**: Clear mocks between tests
4. **Coverage gaps**: Focus on business logic, not UI components

### Performance

- Tests run in parallel where possible
- Database operations are isolated
- Mock external API calls
- Use in-memory SQLite for speed

## Future Improvements

1. **E2E Tests**: Add Playwright tests for critical user flows
2. **Visual Regression**: Add screenshot testing for UI components
3. **Performance Tests**: Add load testing for API endpoints
4. **Accessibility Tests**: Add a11y testing for frontend components
5. **Integration Tests**: Add tests for API + Frontend interaction
