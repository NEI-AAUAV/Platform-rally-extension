# Rally Extension - Testing Documentation

## Overview

The Rally extension uses a comprehensive testing strategy covering unit tests, integration tests, and end-to-end (E2E) tests to ensure reliability and maintainability.

## Testing Stack

### Unit Tests
- **Framework**: Vitest
- **Location**: `tests/unit/`
- **Coverage**: Business logic, utilities, stores, hooks
- **Run**: `pnpm test`
- **Test Files**:
  - `useUserStore.test.ts` - Zustand store tests (authentication, token management)
  - `useRallySettings.test.tsx` - Rally settings hook tests
  - `useActivities.test.tsx` - Activities hooks tests (CRUD operations)
  - `useUser.test.tsx` - User hook tests (user data fetching, admin detection)
  - `useLoginLink.test.ts` - Login link utility tests
  - `timezone.test.ts` - Timezone utility tests

### E2E Tests
- **Framework**: Playwright
- **Location**: `tests/e2e/`
- **Coverage**: Critical user flows, UI interactions, API integration
- **Run**: `pnpm test:e2e`
- **Test Files**:
  - `staff-evaluation.spec.ts` - Staff and manager evaluation flows (41 tests)
  - `scoreboard.spec.ts` - Scoreboard display and leaderboard (5 tests)
  - `admin.spec.ts` - Admin panel navigation and access control (5 tests)
  - `settings.spec.ts` - Settings page and configuration (6 tests)

### Shared Test Utilities
- **Location**: `tests/mocks/`
- **Files**:
  - `data.ts` - Mock data for tests (checkpoints, teams, activities, tokens)

## E2E Test Suite

### Test Organization

**File**: `tests/e2e/staff-evaluation.spec.ts`  
**Total Tests**: 41 tests across 10 test suites

### Test Coverage

#### 1. Staff Evaluation Flow (7 tests)
- Checkpoint display
- Team list display
- Team selection
- Activity display
- Evaluation summary
- Error handling (checkpoint not found)
- Authentication redirect

#### 2. Manager Evaluation Flow (5 tests)
- Manager dashboard display
- All checkpoints view
- All teams view
- All evaluations section
- Navigation to checkpoint evaluation

#### 3. Authentication Edge Cases (3 tests)
- Unauthenticated redirect
- Expired token handling
- Invalid token format

#### 4. API Error Cases (5 tests)
- 500 server error
- 403 forbidden error
- Network timeout
- Malformed JSON response
- Empty API responses

#### 5. Empty Data Cases (5 tests)
- No checkpoint assigned to staff
- Empty teams list
- Empty activities list
- All activities completed
- Checkpoint mismatch handling

#### 6. Evaluation Submission Edge Cases (2 tests)
- Submission failure handling
- Double submission prevention

#### 7. Happy Path & Form Interactions (3 tests)
- Successful evaluation submission
- Form open/close
- Navigation between views

#### 8. Activity Type Evaluations (5 tests)
- **TimeBasedActivity**: Completion time input
- **ScoreBasedActivity**: Achieved points input
- **BooleanActivity**: Success/failure toggle
- **GeneralActivity**: Assigned points input
- **TeamVsActivity**: Match result selection

#### 9. Form Validation (4 tests)
- Negative time values rejection
- Empty time field validation
- Negative points rejection (ScoreBased)
- Negative points rejection (General)

#### 10. Advanced Scenarios (2 tests)
- Update existing evaluations
- Multiple activities sequence evaluation

### Test Architecture

#### Mocking Strategy
- **API Mocking**: Playwright's native `page.route()` for browser-level interception
- **Authentication**: Mock JWT tokens with different scopes (staff, manager)
- **Data**: Centralized mock data in `src/test/mocks/data.ts`

#### Test Patterns
- **Setup**: `beforeEach` hooks for consistent test environment
- **Selectors**: Semantic selectors (`getByRole`, `getByText`) for reliability
- **Assertions**: Focus on user-visible outcomes, not implementation details
- **Error Handling**: Graceful handling of optional UI elements

### Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI
pnpm test:e2e --ui

# Run specific test suite
pnpm test:e2e --grep "Activity Type"

# Generate HTML report
pnpm exec playwright show-report
```

### Test Data

Mock data is centralized in `tests/mocks/data.ts`:
- Checkpoints, teams, activities
- Activity results
- Rally settings
- JWT tokens (staff and manager scopes)

### Best Practices

1. **Isolation**: Each test is independent with its own route mocks
2. **Reliability**: Uses Playwright's auto-waiting and retry mechanisms
3. **Maintainability**: Shared setup functions reduce duplication
4. **Coverage**: Tests cover both happy paths and edge cases
5. **Performance**: Tests run in parallel (6 workers by default)

## Test Metrics

- **Total E2E Tests**: 41
- **Test Suites**: 10
- **Activity Types Covered**: 5/5 (100%)
- **Critical Flows**: Staff evaluation, Manager evaluation
- **Edge Cases**: Authentication, API errors, empty data, validation
- **Average Runtime**: ~33 seconds (parallel execution)

## Maintenance

### Adding New Tests
1. Follow existing patterns in `staff-evaluation.spec.ts`
2. Use semantic selectors
3. Mock all API calls via `page.route()`
4. Test both success and error scenarios
5. Keep tests focused and independent

### Updating Tests
- Update mock data in `src/test/mocks/data.ts` when API contracts change
- Adjust selectors if UI changes significantly
- Maintain backward compatibility with existing test structure

## Future Enhancements

Potential areas for expansion:
- Form validation edge cases (out-of-range values)
- Concurrent evaluation scenarios
- Performance testing
- Accessibility testing
- Cross-browser testing (currently Chromium only)

