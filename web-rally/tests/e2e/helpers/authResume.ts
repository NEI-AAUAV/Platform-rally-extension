import type { Page } from '@playwright/test';

/**
 * Test-side mirror of src/lib/authResumeStore.ts.
 *
 * Auth round-trip state moved from `sessionStorage` to `localStorage` with an
 * explicit TTL (iOS kills backgrounded PWAs mid-login, wiping sessionStorage),
 * so the values are stored as `{ value, expiresAt }` envelopes rather than raw
 * strings. These helpers keep the specs reading and writing the same shape the
 * app does.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** Seeds a resume value before the app boots, as if a login had just started. */
export async function seedResumeValue(
  page: Page,
  key: string,
  value: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  await page.addInitScript(
    ([k, v, ttl]) => {
      localStorage.setItem(
        k as string,
        JSON.stringify({ value: v as string, expiresAt: Date.now() + (ttl as number) }),
      );
    },
    [key, value, ttlMs] as [string, string, number],
  );
}

/** Reads a resume value, returning null when absent, expired or malformed. */
export async function readResumeValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as { value?: unknown }).value !== 'string' ||
        typeof (parsed as { expiresAt?: unknown }).expiresAt !== 'number'
      ) {
        return null;
      }
      const entry = parsed as { value: string; expiresAt: number };
      return entry.expiresAt > Date.now() ? entry.value : null;
    } catch {
      return null;
    }
  }, key);
}
