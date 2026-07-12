/// <reference lib="webworker" />
/**
 * Rally Tascas service worker (Workbox, injectManifest).
 *
 * Replaces the hand-rolled public/sw.js. Precaches the built app shell, serves
 * navigations offline from the shell, and applies conservative runtime caching
 * to same-origin GETs. Auth/OIDC and every mutation (incl. the staff evaluate
 * endpoint) are deliberately never cached — freshness and correctness there
 * matter more than offline reads, and offline submits are handled by the
 * app-side queue (src/offline/evalQueue.ts), not here.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const BASE = "/rally/";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// App shell for SPA navigations, except API and auth paths.
const denylist = [/\/api\//, /\/oidc\//, /\/auth\//];
registerRoute(
  new NavigationRoute(
    async () => {
      const cached = await caches.match(`${BASE}index.html`);
      return cached ?? fetch(`${BASE}index.html`);
    },
    { denylist },
  ),
);

// Read-only API GETs: fresh when online, cached copy as an offline fallback.
// Mutations (POST/PUT/DELETE) are never matched — Workbox routes GET only, and
// we additionally exclude auth/OIDC and the evaluate endpoint by URL.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    url.pathname.includes("/api/rally/") &&
    !url.pathname.includes("/evaluate") &&
    !url.pathname.includes("/oidc") &&
    !url.pathname.includes("/auth"),
  new NetworkFirst({
    cacheName: "rally-api",
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })],
  }),
);

// Static assets (icons, images, fonts).
registerRoute(
  ({ request }) => ["image", "font", "style"].includes(request.destination),
  new CacheFirst({
    cacheName: "rally-static",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

// Preserve the old force-update behavior: activate a new SW immediately when
// the client asks (registerType 'autoUpdate' triggers this).
self.addEventListener("message", (event) => {
  if ((event.data as { action?: string })?.action === "skipWaiting") {
    void self.skipWaiting();
  }
});

self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
