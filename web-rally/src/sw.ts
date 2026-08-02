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
      return cached ?? (await fetch(`${BASE}index.html`));
    },
    { denylist },
  ),
);

// Read-only API GETs: fresh when online, cached copy as an offline fallback.
// Mutations (POST/PUT/DELETE) are never matched — Workbox routes GET only, and
// we additionally exclude auth/OIDC and the evaluate endpoint by URL.
// Server-sent events are a GET under /api/rally/ that never completes. Running
// one through NetworkFirst leaves a request pending for the lifetime of the
// stream: the response is never cached, the network-timeout fallback never
// fires, and the page never reaches a settled/idle network state. Excluded by
// both the path and the Accept header so a new stream endpoint cannot
// reintroduce it by being named something else.
const isEventStream = (url: URL, request: Request): boolean =>
  url.pathname.endsWith("/stream") ||
  (request.headers.get("accept") ?? "").includes("text/event-stream");

registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    url.pathname.includes("/api/rally/") &&
    !isEventStream(url, request) &&
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
//
// cacheWillUpdate rejects anything that isn't a real 200. Cross-origin
// no-cors responses (the Google Fonts stylesheet, any third-party image) come
// back opaque with status 0 and a body we cannot inspect, so caching one
// pins a possible error page for 30 days with no way to tell. This is what
// workbox-cacheable-response does; inlined to avoid pulling in the package for
// three lines. Same-origin and CORS responses are unaffected.
const cacheableOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 ? response : null,
};

registerRoute(
  ({ request }) => ["image", "font", "style"].includes(request.destination),
  new CacheFirst({
    cacheName: "rally-static",
    plugins: [
      cacheableOnly,
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Activate a new SW when the client asks. The app now prompts before doing so
// (registerType 'prompt' — see src/main.tsx and PWAUpdatePrompt), rather than
// swapping under a half-filled evaluation form, so this message is the only
// path to skipWaiting.
// Two shapes are accepted: the app's own `{action:"skipWaiting"}` (kept for
// anything already sending it) and workbox-window's `{type:"SKIP_WAITING"}`,
// which is what the virtual:pwa-register update function posts.
self.addEventListener("message", (event) => {
  const data = event.data as { action?: string; type?: string } | undefined;
  if (data?.action === "skipWaiting" || data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// Navigation preload is deliberately NOT enabled: every navigation is answered
// from the precached app shell, so a preloaded network response would be
// fetched and then thrown away on each one.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push (VAPID). Requires iOS 16.4+ AND the PWA installed to the Home
// Screen — Safari never fires `push` for a plain browser tab.
interface RallyPushPayload {
  title?: string;
  body?: string;
  url?: string;
}

// App icon badge count. Cache Storage (not a variable) because the SW can be
// killed and restarted between pushes — a plain module-scope counter would
// reset to 0 on every wakeup.
const BADGE_CACHE = "rally-badge-count";
const BADGE_KEY = "https://rally.badge/count";

async function readBadgeCount(): Promise<number> {
  const cache = await caches.open(BADGE_CACHE);
  const res = await cache.match(BADGE_KEY);
  if (!res) return 0;
  return Number(await res.text()) || 0;
}

async function writeBadgeCount(count: number): Promise<void> {
  const cache = await caches.open(BADGE_CACHE);
  await cache.put(BADGE_KEY, new Response(String(count)));
}

async function bumpAppBadge(): Promise<void> {
  const count = (await readBadgeCount()) + 1;
  await writeBadgeCount(count);
  const reg = self.registration as ServiceWorkerRegistration & {
    setAppBadge?: (count?: number) => Promise<void>;
  };
  await reg.setAppBadge?.(count);
}

async function resetAppBadge(): Promise<void> {
  await writeBadgeCount(0);
  const reg = self.registration as ServiceWorkerRegistration & {
    clearAppBadge?: () => Promise<void>;
  };
  await reg.clearAppBadge?.();
}

self.addEventListener("message", (event) => {
  if ((event.data as { action?: string })?.action === "clearBadge") {
    event.waitUntil(resetAppBadge());
  }
});

self.addEventListener("push", (event) => {
  let payload: RallyPushPayload;
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? "Rally Tascas";
  const url = payload.url ?? BASE;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: payload.body ?? "",
        icon: `${BASE}icon-192.png`,
        badge: `${BASE}icon-192.png`,
        data: { url },
        // Collapse repeats for the same destination instead of stacking a
        // shade full of near-identical rows; renotify still buzzes so a real
        // update isn't silently swallowed. Both are ignored by Safari.
        tag: url,
        renotify: true,
        // Android renders these as buttons on the notification; iOS ignores
        // them, and the whole-notification tap keeps working on both.
        actions: [{ action: "open", title: "Abrir" }],
      } as NotificationOptions & { renotify?: boolean }),
      bumpAppBadge(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? BASE;
  // "open" is the only action offered, and it does what a body tap does; any
  // other action id would be a dismissal we should not navigate for.
  if (event.action && event.action !== "open") return;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientsList.find((client) => client.url.includes(url));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/**
 * Chrome rotates push endpoints (expiry, storage pressure, key rotation) and
 * fires this instead of silently dropping delivery. Without a handler the old
 * endpoint stays registered server-side, every send 410s, and push stops
 * working with no signal anywhere.
 *
 * The SW re-subscribes with the same application server key so the browser
 * side is healthy again immediately, then parks the new subscription for the
 * page to register. It cannot call /push/subscribe itself: that endpoint is
 * user-scoped and the bearer token lives in the page, not here.
 */
const PENDING_SUB_CACHE = "rally-push-pending";
const PENDING_SUB_KEY = "https://rally.push/pending-subscription";

self.addEventListener("pushsubscriptionchange", (event) => {
  const changeEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };

  event.waitUntil(
    (async () => {
      let subscription = changeEvent.newSubscription ?? null;

      if (!subscription) {
        // Firefox/Chrome may hand us only the old one; re-subscribe with its
        // key. Without a key there is nothing valid to subscribe with, so bail
        // rather than create a subscription the server can never authenticate.
        const key = changeEvent.oldSubscription?.options?.applicationServerKey;
        if (!key) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }

      const cache = await caches.open(PENDING_SUB_CACHE);
      await cache.put(PENDING_SUB_KEY, new Response(JSON.stringify(subscription.toJSON())));

      // If a window happens to be open, it can sync right now instead of
      // waiting for the next launch.
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
    })(),
  );
});

/**
 * Background Sync for the offline evaluation queue — a supplement, never the
 * mechanism. iOS has no Background Sync at all, so src/offline/useOfflineSync
 * remains the universal path and drains on mount/online/visibilitychange; on
 * Chrome this additionally lets a replay happen after the app is closed.
 *
 * The queue itself lives in IndexedDB behind idb-keyval and replays through
 * the generated SDK with an auth token held by the page, so the SW does not
 * replay directly: it wakes a client and lets it drain. When no client can be
 * woken the entries simply stay queued for the next foreground drain, which is
 * the pre-existing behaviour.
 */
self.addEventListener("sync", (event) => {
  // "sync" is not in TypeScript's service-worker event map, so the listener
  // parameter is a bare Event.
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== "rally-eval-queue") return;

  syncEvent.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (clientsList.length === 0) return;
      clientsList.forEach((client) => client.postMessage({ type: "DRAIN_EVAL_QUEUE" }));
    })(),
  );
});
