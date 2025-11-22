# Rally Testing Guide

This guide provides a practical overview of the testing strategy for the Rally extension, focusing on how to run, debug, and contribute tests.

## Running Tests

### Unit Tests

Run all unit tests, located in `tests/unit/`, with Vitest.

```bash
pnpm test
```

### End-to-End (E2E) Tests

Run all E2E tests, located in `tests/e2e/`, with Playwright.

```bash
# Run all E2E tests in headless mode
pnpm test:e2e

# Run in UI mode for debugging
pnpm test:e2e --ui

# Run a specific test file or suite by name
pnpm test:e2e --grep "Admin"

# View the last HTML report
pnpm exec playwright show-report
```

## Testing Overview

We use two main types of tests to ensure code quality.

#### 1. Unit Tests (Vitest)

-   **Purpose:** To test individual functions, hooks, and stores in isolation.
-   **Location:** `tests/unit/`
-   **Scope:** Covers business logic, timezone utilities, and state management (Zustand stores).

#### 2. End-to-End Tests (Playwright)

-   **Purpose:** To validate critical user flows from end to end in a real browser environment.
-   **Location:** `tests/e2e/`
-   **Scope:** Covers flows like staff and manager evaluations, scoreboard functionality, admin access, and settings management. It verifies UI interactions and integration with mocked API endpoints.

## E2E Test Architecture

Our E2E suite is built with a few key principles to keep tests reliable and maintainable.

### API Mocking

We use Playwright's native `page.route()` to intercept browser API calls and provide mock responses. This ensures tests are fast, deterministic, and don't rely on a live backend.

-   All mock data is centralized in `tests/mocks/data.ts`.
-   Authentication is handled by providing mock JWTs with different user scopes (e.g., staff, manager).

### Best Practices

-   **Isolation:** Each test is fully independent and mocks its own API routes.
-   **Semantic Selectors:** We prefer user-facing selectors like `getByRole` and `getByText` over brittle CSS or XPath selectors.
-   **Auto-Waiting:** We rely on Playwright's auto-waiting mechanisms to avoid flaky `sleep()` calls.

## Contributing Tests

### Adding a New Unit Test

1.  Create a `*.test.ts` file alongside the source file you are testing.
2.  Import `describe`, `it`, and `expect` from `vitest`.
3.  Write tests that cover the core logic and edge cases of your function or hook.

### Adding a New E2E Test

1.  Open an existing spec file in `tests/e2e/` or create a new one.
2.  Use a `beforeEach` hook to set up a consistent test environment (e.g., navigate to a page, mock initial API calls).
3.  Write your test using `async/await` syntax.
4.  Mock all API calls your test will trigger using `page.route()`.
5.  Use semantic selectors to interact with the page.
6.  Make assertions based on user-visible outcomes (e.g., `expect(page.getByText('Success!')).toBeVisible()`).