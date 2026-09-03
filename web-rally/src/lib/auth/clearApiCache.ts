/**
 * Ask the service worker to drop its cached public API responses.
 *
 * Called on sign-out. The worker never caches authenticated responses (the
 * `Authorization` header excludes them from its runtime route — see
 * `src/sw.ts`), so this is not the boundary that keeps two identities apart;
 * it clears the anonymous slice so the next person on a shared phone starts
 * from the network rather than from what the previous session happened to
 * look at.
 *
 * Deliberately non-fatal and non-blocking: no service worker (dev, an
 * unsupported browser, a first load before registration settles) simply means
 * there is no cache to clear, and a sign-out must not be held up — let alone
 * fail — over a cache purge.
 */
export async function clearApiCache(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ action: "clearApiCache" });
  } catch (error: unknown) {
    console.warn("Could not ask the service worker to clear its API cache.", error);
  }
}
