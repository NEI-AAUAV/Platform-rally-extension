import { defineConfig, devices } from '@playwright/test';
const baseURL = 'http://localhost:4190';
export default defineConfig({
  testDir: './tests/e2e', reporter: 'line', workers: 6,
  use: { serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL, serviceWorkers: 'block' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], baseURL, serviceWorkers: 'block' } },
  ],
});
