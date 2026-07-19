import { defineConfig, devices } from '@playwright/test';

// The fullstack project drives a separately-built preview server (port 4174)
// proxying /api to a real running api-rally (docker-compose.smoke.yml,
// default localhost:8003) instead of route-mocking. See tests/e2e-fullstack/README.md.
const FULLSTACK_PORT = 4174;
const FULLSTACK_API_PROXY_TARGET = process.env.FULLSTACK_API_BASE_URL ?? 'http://localhost:8003';

/**
 * Playwright configuration for e2e tests
 * Uses Playwright's native route mocking (works in browser context)
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
        // Block service workers to prevent interference with route mocking
        serviceWorkers: 'block',
      },
    },
    {
      name: 'mobile',
      testDir: './tests/e2e',
      use: {
        ...devices['Pixel 7'],
        baseURL: 'http://localhost:4173',
        serviceWorkers: 'block',
      },
    },
    {
      name: 'fullstack',
      testDir: './tests/e2e-fullstack',
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${FULLSTACK_PORT}`,
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: `pnpm exec vite preview --port ${FULLSTACK_PORT}`,
      url: `http://localhost:${FULLSTACK_PORT}/rally/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: { FULLSTACK_API_PROXY_TARGET },
    },
  ],
});

