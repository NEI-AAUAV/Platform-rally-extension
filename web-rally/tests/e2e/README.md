# E2E Tests

End-to-end tests using Playwright with browser-level API mocking via `page.route()`.

**41 tests** covering staff/manager evaluation flows, all activity types, form validation, and edge cases.

## Quick Reference

```bash
pnpm test:e2e              # Run all tests
pnpm test:e2e --ui         # Interactive mode
pnpm test:e2e --grep "..." # Filter by name
```

## Test Files

- `staff-evaluation.spec.ts` - Main test suite (41 tests, 10 suites)

## Architecture

- **Mocking**: Playwright `page.route()` for browser-level interception
- **Auth**: JWT tokens via `context.addInitScript()`
- **Data**: Centralized mocks in `src/test/mocks/data.ts`
- **Config**: `playwright.config.ts` (base URL: `http://localhost:4173`)

## Test Pattern

```typescript
test.beforeEach(async ({ page, context }) => {
  await page.route('**/api/endpoint', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify(mockData) });
  });
  
  await context.addInitScript(
    ([token]) => localStorage.setItem('rally_token', token),
    [MOCK_JWT_TOKEN]
  );
  
  await page.goto('/rally/path');
  await page.waitForLoadState('networkidle');
});
```

For complete documentation, see [`../TESTING.md`](../TESTING.md).

