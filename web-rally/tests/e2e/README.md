# E2E Tests for Rally Extension

This directory contains end-to-end (e2e) tests for the Rally extension using Playwright and MSW (Mock Service Worker).

## Setup

### Prerequisites

1. Install dependencies:
```bash
pnpm install
```

2. Build the application:
```bash
pnpm build
```

### Running Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run tests in UI mode (interactive)
pnpm test:e2e:ui

# Run tests in debug mode
pnpm test:e2e:debug

# Run specific test file
pnpm test:e2e tests/e2e/staff-evaluation.spec.ts
```

## Architecture

### MSW (Mock Service Worker)

We use MSW to mock API requests at the network level. This approach:

- ✅ Intercepts requests before service workers
- ✅ Works with fetch-based APIs
- ✅ More reliable than Playwright route mocking
- ✅ Better debugging and request inspection

### Mock Data

Mock data is defined in `src/test/mocks/data.ts` with proper TypeScript types matching the API schemas.

### Handlers

API handlers are defined in `src/test/mocks/handlers.ts` and intercept all Rally API endpoints.

## Test Structure

Tests are organized by feature:

- `staff-evaluation.spec.ts` - Staff evaluation flow tests

## Writing New Tests

1. Create a new test file: `tests/e2e/feature-name.spec.ts`
2. Import mock data from `src/test/mocks/data.ts`
3. Use MSW handlers (already set up globally)
4. Set up authentication via `context.addInitScript()` to set token in localStorage
5. Navigate and test user interactions

Example:

```typescript
import { test, expect } from '@playwright/test';
import { MOCK_JWT_TOKEN } from '../../src/test/mocks/data';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set auth token
    await context.addInitScript(
      ([token]) => {
        localStorage.setItem('rally_token', token);
      },
      [MOCK_JWT_TOKEN],
    );

    // Navigate
    await page.goto('/rally/feature-path');
    await page.waitForLoadState('networkidle');
  });

  test('should do something', async ({ page }) => {
    // Your test here
    await expect(page.getByText('Expected Text')).toBeVisible();
  });
});
```

## Configuration

Playwright configuration is in `playwright.config.ts` at the project root.

Key settings:
- Base URL: `http://localhost:4173` (Vite preview server)
- Service workers: Blocked (to prevent interference with MSW)
- MSW: Automatically set up in `globalSetup` and `globalTeardown`

## Troubleshooting

### Tests fail with "Network error"

- Ensure the app is built: `pnpm build`
- Check that MSW handlers are properly set up
- Verify mock data matches API response structure

### Service worker interference

- Service workers are automatically blocked in Playwright config
- If issues persist, check `playwright.config.ts` has `serviceWorkers: 'block'`

### Authentication issues

- Ensure token is set in `beforeEach` via `addInitScript`
- Check that token format matches what the app expects
- Verify MSW handlers don't require authentication (or mock auth endpoints)

## Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors
2. **Wait for network idle**: Use `waitForLoadState('networkidle')` after navigation
3. **Isolate tests**: Each test should be independent and not rely on previous test state
4. **Use proper assertions**: Use Playwright's built-in assertions (`expect().toBeVisible()`, etc.)
5. **Mock data consistency**: Keep mock data in sync with actual API responses

