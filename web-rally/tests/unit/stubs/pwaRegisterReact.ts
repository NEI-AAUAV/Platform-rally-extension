/**
 * Test stand-in for vite-plugin-pwa's `virtual:pwa-register/react`.
 *
 * The real module only exists when the PWA plugin runs (vite build/dev), so
 * vitest cannot resolve it. Vitest >= 4.1 also transforms files that no test
 * imports when collecting coverage, which turned that unresolved import into
 * an unhandled error and failed the run.
 */
type StatePair = [boolean, (value: boolean) => void];

export function useRegisterSW(): {
  needRefresh: StatePair;
  offlineReady: StatePair;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
