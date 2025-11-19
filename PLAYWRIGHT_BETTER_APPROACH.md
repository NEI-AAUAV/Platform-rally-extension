# Better Approach for Playwright E2E Testing

## Analysis of Current Issues

### Root Cause
1. **Service Worker Interference**: The service worker (`/rally/sw.js`) intercepts ALL requests containing `/rally/` in the URL, including API requests (`/api/rally/v1/checkpoint/`). Even though it passes through API requests, it intercepts them **before** Playwright's route handlers can catch them.

2. **Request Timing**: The service worker's `fetch` event handler runs before Playwright's route mocking, causing a race condition.

3. **URL Pattern Matching**: The exact URL format (`/api/rally/v1/checkpoint/` with trailing slash) might not match Playwright's glob patterns correctly.

## Recommended Solution: MSW (Mock Service Worker)

### Why MSW is Better

1. **Network-Level Interception**: MSW intercepts requests at the network level using Service Worker API, which runs **before** your app's service worker
2. **Works with Fetch**: Designed specifically for modern fetch-based APIs
3. **Reliable**: Battle-tested library used by thousands of projects
4. **Better DX**: Better debugging, request inspection, and error messages
5. **Reusable**: Same mocks can be used in unit tests (Vitest) and e2e tests (Playwright)

### Implementation Plan

#### Step 1: Install MSW

```bash
cd Platform/extensions/rally/web-rally
pnpm add -D msw@latest
```

#### Step 2: Create MSW Handlers

Create `web-rally/src/test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';
import { CHECKPOINT, TEAM, ACTIVITY, PUBLIC_SETTINGS } from './data';

const API_BASE = '/api/rally/v1';

export const handlers = [
  // Public settings
  http.get(`${API_BASE}/rally/settings/public`, () => {
    return HttpResponse.json(PUBLIC_SETTINGS);
  }),

  // Get all checkpoints
  http.get(`${API_BASE}/checkpoint/`, () => {
    return HttpResponse.json([CHECKPOINT]);
  }),

  // Get teams
  http.get(`${API_BASE}/team/`, () => {
    return HttpResponse.json([TEAM]);
  }),

  // Get activities
  http.get(`${API_BASE}/activities/`, () => {
    return HttpResponse.json([ACTIVITY]);
  }),

  // Staff evaluation endpoints
  http.get(`${API_BASE}/staff/checkpoint/teams`, () => {
    return HttpResponse.json([TEAM]);
  }),

  http.post(`${API_BASE}/staff/evaluation`, () => {
    return HttpResponse.json({ success: true });
  }),
];
```

#### Step 3: Create Mock Data

Create `web-rally/src/test/mocks/data.ts`:

```typescript
export const CHECKPOINT = {
  id: 1,
  name: "Posto 1",
  order: 1,
  // ... other fields
};

export const TEAM = {
  id: 1,
  name: "Test Team",
  // ... other fields
};

export const ACTIVITY = {
  id: 1,
  name: "Test Activity",
  checkpoint_id: 1,
  // ... other fields
};

export const PUBLIC_SETTINGS = {
  // ... settings data
};
```

#### Step 4: Setup MSW for Playwright

Create `web-rally/tests/e2e/msw-setup.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from '../../src/test/mocks/handlers';

// Create MSW server for Node.js (Playwright runs in Node)
export const server = setupServer(...handlers);

// Setup before all tests
export function setupMSW() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
```

#### Step 5: Configure Playwright to Use MSW

Update `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import { setupServer } from 'msw/node';
import { handlers } from './src/test/mocks/handlers';

const server = setupServer(...handlers);

export default defineConfig({
  // ... existing config
  
  globalSetup: async () => {
    // Start MSW server before all tests
    server.listen({ onUnhandledRequest: 'error' });
  },

  globalTeardown: async () => {
    // Stop MSW server after all tests
    server.close();
  },

  use: {
    // Disable service worker in tests
    serviceWorkers: 'block',
    
    // Or use context option
    // contextOptions: {
    //   serviceWorkers: 'block',
    // },
  },
});
```

#### Step 6: Update Test File

Update `web-rally/tests/e2e/staff-evaluation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// Mock data
const MOCK_TOKEN = 'mock-jwt-token';
const CHECKPOINT_ID = '1';

test.describe('Staff Evaluation Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // 1. Set token in localStorage
    await context.addInitScript(([token]) => {
      localStorage.setItem('rally_token', token);
    }, [MOCK_TOKEN]);

    // 2. Navigate to page (MSW will intercept API calls)
    await page.goto(`/rally/staff-evaluation/checkpoint/${CHECKPOINT_ID}`);

    // 3. Wait for app to initialize
    await page.waitForLoadState('networkidle');
  });

  test('displays checkpoint name', async ({ page }) => {
    // MSW will automatically intercept the checkpoint API call
    await expect(page.getByText('Posto 1')).toBeVisible();
  });

  test('displays teams list', async ({ page }) => {
    await expect(page.getByText('Test Team')).toBeVisible();
  });
});
```

### Alternative: Disable Service Worker in Tests

If you prefer to stick with Playwright route mocking, disable the service worker:

#### Option 1: Block Service Workers in Playwright Config

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    serviceWorkers: 'block', // Blocks all service workers
  },
});
```

#### Option 2: Unregister Service Worker in Test Setup

```typescript
test.beforeEach(async ({ page, context }) => {
  // Unregister service worker before navigation
  await context.addInitScript(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }
  });

  // Now set up route mocks
  await page.route('**/api/rally/v1/checkpoint/**', async (route) => {
    await route.fulfill({ json: [CHECKPOINT] });
  });

  // Navigate
  await page.goto('/rally/staff-evaluation/checkpoint/1');
});
```

### Alternative: Use Playwright Fixtures

Create a reusable fixture for test setup:

```typescript
// tests/e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { handlers } from '../src/test/mocks/handlers';
import { setupServer } from 'msw/node';

const server = setupServer(...handlers);

type TestFixtures = {
  mockServer: typeof server;
};

export const test = base.extend<TestFixtures>({
  mockServer: async ({}, use) => {
    server.listen({ onUnhandledRequest: 'error' });
    await use(server);
    server.resetHandlers();
  },
});

export { expect } from '@playwright/test';
```

## Comparison of Approaches

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **MSW** | ✅ Network-level interception<br>✅ Works with service workers<br>✅ Reusable across test types<br>✅ Better debugging | ⚠️ Additional dependency<br>⚠️ Slightly more setup | ⭐ **Best choice** |
| **Disable SW + Playwright Routes** | ✅ No new dependencies<br>✅ Uses built-in Playwright features | ❌ Less reliable<br>❌ Doesn't work if SW is required<br>❌ Pattern matching issues | ⚠️ Fallback option |
| **Mock at Service Level** | ✅ Fast<br>✅ No network mocking needed | ❌ Doesn't test real API calls<br>❌ More setup per test | ❌ Not recommended for e2e |

## Recommended Implementation Steps

1. **Start with MSW** (recommended)
   - Install MSW
   - Create handlers and mock data
   - Configure Playwright to use MSW
   - Update tests to use MSW

2. **If MSW doesn't work**, try:
   - Disable service worker in Playwright config
   - Use exact URL patterns in route mocking
   - Add request logging to debug

3. **As last resort**:
   - Mock at service level (not true e2e)
   - Use component testing instead

## Next Steps

1. Install MSW: `pnpm add -D msw@latest`
2. Create mock handlers and data files
3. Configure Playwright to use MSW
4. Update test file to use MSW
5. Remove test mode infrastructure (no longer needed)
6. Test and verify

## Benefits of MSW Approach

- ✅ **No test mode needed**: MSW works transparently
- ✅ **No service worker issues**: MSW intercepts before SW
- ✅ **Better debugging**: See all intercepted requests
- ✅ **Reusable mocks**: Same handlers for unit and e2e tests
- ✅ **Type-safe**: Can use TypeScript types from API client
- ✅ **Maintainable**: Centralized mock data and handlers

