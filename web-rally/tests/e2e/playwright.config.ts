import { defineConfig, devices } from '@playwright/test';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

// Create MSW server for Node.js (Playwright runs in Node)
const server = setupServer(...handlers);

/**
 * Playwright configuration for e2e tests
 * Uses MSW to mock API requests
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Block service workers to prevent interference with MSW
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  // Setup MSW before all tests
  globalSetup: async () => {
    server.listen({ onUnhandledRequest: 'error' });
  },

  // Cleanup MSW after all tests
  globalTeardown: async () => {
    server.close();
  },
});

