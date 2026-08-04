import { test, expect } from '@playwright/test';
import { mintToken, API_V1 } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: the mocked tests/e2e/offline-pwa.spec.ts checks two
 * things — the manifest/service-worker being served, and the real
 * (unmocked) evalQueue.ts/useOfflineSync.ts queue-and-drain logic against a
 * *route-mocked* evaluate endpoint. The queue-against-a-real-backend case is
 * already covered by rally-day.spec.ts's incident 3 (staffB's evaluate call
 * drops offline mid-submit, queues, then drains against the real API on
 * reconnect) — duplicating it here would just re-run the same assertion
 * against a smaller scenario.
 *
 * What neither covers: that the manifest and service worker are actually
 * served by the real production build the `fullstack` Playwright project
 * runs against (`vite preview` serving `dist/`, proxying to the real
 * backend) — a build config regression (e.g. vite-plugin-pwa misconfigured,
 * manifest icons pointing at a moved path) would only show up against a real
 * built artifact, not a mocked route intercepting `/manifest.json` before
 * the real file is ever requested.
 */

async function rawFetch(
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${API_V1}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

test.describe('PWA artifacts served by the real build', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('the web app manifest and service worker are served by the real preview build, proxying to the real backend', async ({
    page,
  }) => {
    // Needs at least one real event/settings row for the public settings
    // call the app shell makes on load to succeed — doesn't need to be
    // "current" or configured beyond existing, since this test only cares
    // about static assets the app shell serves regardless of rally state.
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-pwa-admin-${runId}`,
      name: 'E2E PWA Admin',
      groups: ['admin'],
      email: `e2e-pwa-admin-${runId}@ua.pt`,
    });
    const event = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E PWA Event ${runId}`, slug: `e2e-pwa-event-${runId}` },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${event.id}/set-current`, { token: admin.accessToken });

    await page.goto('/rally/');

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    // Fetched through the real preview server (not intercepted) — this is
    // the actual file vite-plugin-pwa emitted at build time.
    const manifestResponse = await page.request.get(new URL(manifestHref as string, page.url()).toString());
    expect(manifestResponse.ok()).toBe(true);
    const manifest = (await manifestResponse.json()) as {
      name: string;
      icons?: { src: string; purpose?: string }[];
      start_url?: string;
      id?: string;
      scope?: string;
      display?: string;
      handle_links?: string;
    };
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

    // Installability and Android app-like behaviour, all of which are silent
    // when wrong: the app still loads, it just installs as a shortcut, opens
    // in-app links in a browser tab, or ignores launcher theming.
    expect(manifest.display).toBe('standalone');
    expect(manifest.id).toBe('/rally/');
    expect(manifest.scope).toBe('/rally/');
    expect(manifest.handle_links).toBe('preferred');

    const purposes = (manifest.icons ?? []).map((icon) => icon.purpose);
    expect(purposes).toContain('maskable');
    expect(purposes).toContain('monochrome');

    // Every icon must actually be served; a 404 here is invisible until an
    // install dialog renders a blank square.
    for (const icon of manifest.icons ?? []) {
      const iconResponse = await page.request.get(new URL(icon.src, page.url()).toString());
      expect(iconResponse.ok(), `icon ${icon.src} is not served`).toBe(true);
    }

    // Android Chrome tints the status bar from the last matching theme-color,
    // so both colour schemes need one or the tint stays stuck on one mode.
    await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"][media*="dark"]')).toHaveCount(1);

    const swResponse = await page.request.get(new URL('/rally/sw.js', page.url()).toString());
    expect(swResponse.ok()).toBe(true);

    // The app shell itself must have actually rendered against the real
    // backend (not just the static assets) — the public settings call this
    // page makes on load must have succeeded against the real API through
    // the fullstack project's proxy.
    await expect(page.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
