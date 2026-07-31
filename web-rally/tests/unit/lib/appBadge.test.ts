/**
 * Test suite for appBadge — thin, defensive wrapper over the Badging API,
 * which is absent on most non-Chromium browsers and a silent no-op on iOS.
 * The point of these tests is that a missing API must never throw.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setAppBadge, clearAppBadge } from '@/lib/appBadge';

type BadgeMocks = {
  setAppBadge?: ReturnType<typeof vi.fn>;
  clearAppBadge?: ReturnType<typeof vi.fn>;
  controller?: { postMessage: ReturnType<typeof vi.fn> } | null;
};

/** Installs the given Badging API surface onto `navigator` for one test. */
function stubNavigator({ setAppBadge, clearAppBadge, controller }: BadgeMocks) {
  const props: PropertyDescriptorMap = {
    serviceWorker: { value: { controller: controller ?? null }, configurable: true },
  };
  if (setAppBadge) props.setAppBadge = { value: setAppBadge, configurable: true };
  if (clearAppBadge) props.clearAppBadge = { value: clearAppBadge, configurable: true };
  Object.defineProperties(navigator, props);
}

describe('appBadge', () => {
  beforeEach(() => {
    // jsdom's navigator has no Badging API; start each test from that baseline.
    for (const prop of ['setAppBadge', 'clearAppBadge', 'serviceWorker']) {
      if (prop in navigator) {
        Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, prop);
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setAppBadge', () => {
    it('forwards a positive count to the platform API', () => {
      const set = vi.fn().mockResolvedValue(undefined);
      stubNavigator({ setAppBadge: set });

      setAppBadge(3);

      expect(set).toHaveBeenCalledWith(3);
    });

    it('clears rather than sets when the count is zero or negative', () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const clear = vi.fn().mockResolvedValue(undefined);
      stubNavigator({ setAppBadge: set, clearAppBadge: clear });

      setAppBadge(0);
      setAppBadge(-1);

      expect(set).not.toHaveBeenCalled();
      expect(clear).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when the platform has no Badging API', () => {
      expect(() => setAppBadge(3)).not.toThrow();
    });

    it('swallows a rejected platform promise', async () => {
      const set = vi.fn().mockRejectedValue(new Error('not allowed'));
      stubNavigator({ setAppBadge: set });

      expect(() => setAppBadge(3)).not.toThrow();
      await Promise.resolve();
    });
  });

  describe('clearAppBadge', () => {
    it('calls the platform API and notifies the service worker', () => {
      const clear = vi.fn().mockResolvedValue(undefined);
      const postMessage = vi.fn();
      stubNavigator({ clearAppBadge: clear, controller: { postMessage } });

      clearAppBadge();

      expect(clear).toHaveBeenCalled();
      // The SW keeps its own badge count in Cache Storage (see src/sw.ts), so
      // it has to be told to reset independently of the page-side call.
      expect(postMessage).toHaveBeenCalledWith({ action: 'clearBadge' });
    });

    it('does not throw when there is no Badging API and no controlling worker', () => {
      expect(() => clearAppBadge()).not.toThrow();
    });

    it('still clears when a service worker exists but is not controlling', () => {
      const clear = vi.fn().mockResolvedValue(undefined);
      stubNavigator({ clearAppBadge: clear, controller: null });

      expect(() => clearAppBadge()).not.toThrow();
      expect(clear).toHaveBeenCalled();
    });
  });
});
