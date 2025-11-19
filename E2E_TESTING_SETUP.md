# E2E Testing Setup - Complete Implementation

## Overview

A complete end-to-end testing setup has been implemented for the Rally extension using **MSW (Mock Service Worker)** and **Playwright**. This is the recommended approach that solves the service worker interference issues.

## What Was Implemented

### 1. Dependencies Added

- `@playwright/test` - Playwright testing framework
- `msw` - Mock Service Worker for API mocking

### 2. Files Created

#### Mock Data (`src/test/mocks/data.ts`)
- TypeScript-typed mock data matching API schemas
- Includes: checkpoints, teams, activities, settings, activity results
- Mock JWT token for authentication

#### MSW Handlers (`src/test/mocks/handlers.ts`)
- Network-level API request interceptors
- Handles all Rally API endpoints:
  - `/api/rally/v1/rally/settings/public`
  - `/api/rally/v1/checkpoint/`
  - `/api/rally/v1/team/`
  - `/api/rally/v1/activities/`
  - `/api/rally/v1/activities/results`
  - `/api/rally/v1/staff/teams/:teamId/activities`
  - `/api/rally/v1/staff/teams/:teamId/activities/:activityId/evaluate`

#### Playwright Config (`playwright.config.ts`)
- Configured to use MSW in `globalSetup`/`globalTeardown`
- Blocks service workers to prevent interference
- Auto-starts Vite preview server
- Configured for Chromium browser

#### E2E Tests (`tests/e2e/staff-evaluation.spec.ts`)
- Complete test suite for staff evaluation flow
- Tests checkpoint display, team selection, activities, evaluation
- Authentication tests

#### Documentation
- `tests/e2e/README.md` - Comprehensive guide for writing and running tests

## Why MSW is Better

1. **Network-Level Interception**: MSW intercepts at the network level, before service workers
2. **Reliable**: Battle-tested library used by thousands of projects
3. **Works with Fetch**: Designed for modern fetch-based APIs
4. **Better Debugging**: Clear request/response inspection
5. **Reusable**: Same mocks can be used in unit tests (Vitest) and e2e tests

## How to Use

### Install Dependencies

```bash
cd Platform/extensions/rally/web-rally
pnpm install
```

### Run Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run in UI mode (interactive)
pnpm test:e2e:ui

# Run in debug mode
pnpm test:e2e:debug

# Run specific test file
pnpm test:e2e tests/e2e/staff-evaluation.spec.ts
```

### Write New Tests

1. Create test file: `tests/e2e/feature-name.spec.ts`
2. Import mock data: `import { MOCK_JWT_TOKEN } from '../../src/test/mocks/data'`
3. Set up authentication in `beforeEach`:
   ```typescript
   await context.addInitScript(
     ([token]) => {
       localStorage.setItem('rally_token', token);
     },
     [MOCK_JWT_TOKEN],
   );
   ```
4. Navigate and test: MSW automatically intercepts API calls

## Test Structure

```
web-rally/
├── playwright.config.ts          # Playwright configuration
├── tests/
│   └── e2e/
│       ├── README.md            # Test documentation
│       └── staff-evaluation.spec.ts  # Test file
└── src/
    └── test/
        └── mocks/
            ├── data.ts          # Mock data
            └── handlers.ts      # MSW handlers
```

## Key Features

- ✅ **No Test Mode Needed**: MSW works transparently
- ✅ **No Service Worker Issues**: MSW intercepts before SW
- ✅ **Type-Safe**: Uses actual TypeScript types from API client
- ✅ **Maintainable**: Centralized mock data and handlers
- ✅ **Fast**: No real API calls, instant responses

## Troubleshooting

### Tests fail with network errors
- Ensure app is built: `pnpm build`
- Check MSW handlers match API endpoints
- Verify mock data structure matches API responses

### Service worker still interfering
- Service workers are automatically blocked in Playwright config
- If issues persist, check `playwright.config.ts` has `serviceWorkers: 'block'`

### Authentication not working
- Ensure token is set via `addInitScript` in `beforeEach`
- Check token format matches what the app expects
- Verify MSW handlers don't require auth (or mock auth endpoints)

## Next Steps

1. **Add More Tests**: Expand test coverage for other features
2. **Update Mock Data**: Keep mock data in sync with API changes
3. **Add More Handlers**: Add handlers for additional endpoints as needed
4. **CI Integration**: Add e2e tests to CI/CD pipeline

## Comparison with Previous Approach

| Aspect | Previous (Playwright Routes) | Current (MSW) |
|--------|------------------------------|---------------|
| Service Worker | ❌ Interfered | ✅ Works correctly |
| Reliability | ⚠️ Pattern matching issues | ✅ Reliable |
| Debugging | ⚠️ Limited | ✅ Excellent |
| Reusability | ❌ E2E only | ✅ Unit + E2E |
| Setup Complexity | ⚠️ Medium | ✅ Simple |

## References

- [MSW Documentation](https://mswjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Test README](./tests/e2e/README.md)

