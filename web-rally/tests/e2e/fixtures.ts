import { test as base, expect } from "@playwright/test";

/**
 * SSE endpoints the app opens via EventSource. These connections never
 * "finish", so any `networkidle` wait in a mocked spec would hang until the
 * test times out. Both hooks (`useRallyEventStream`, `useScoreboardStream`)
 * close the source on error, so aborting the request is enough to shut the
 * subsystem down without a reconnect loop.
 */
const SSE_ROUTES = ["**/api/rally/v1/events/stream**", "**/api/rally/v1/scoreboard/stream**"];

/**
 * The mocked e2e suite's `test`. Identical to Playwright's, except every page
 * starts with the realtime SSE streams blocked — mocked specs assert on
 * fixtures, not on live pushes, and an open stream keeps the network
 * permanently busy.
 *
 * Import `test`/`expect` from here instead of `@playwright/test` in
 * `tests/e2e/`. Full-stack specs (`tests/e2e-fullstack/`) run against a real
 * backend and must keep the streams, so they import Playwright directly.
 */
export const test = base.extend<{ blockEventStreams: void }>({
  blockEventStreams: [
    async ({ page }, use) => {
      for (const pattern of SSE_ROUTES) {
        await page.route(pattern, (route) => route.abort());
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
