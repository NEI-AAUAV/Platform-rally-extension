/**
 * Short-lived storage for state that has to survive an OIDC round trip.
 *
 * `sessionStorage` is the natural fit but it does not survive on iOS: the
 * authentik hop leaves the standalone PWA through a Safari View Controller,
 * and iOS routinely kills backgrounded PWAs — the app comes back as a cold
 * start with an empty session, losing the return URL or the pending team link
 * mid-flow. `localStorage` survives that kill, so it is used here with an
 * explicit TTL to keep the widened lifetime bounded: these values are only
 * meaningful for the few minutes an authentication takes, and one of them is a
 * team access code.
 */
import { logger } from "@/lib/logger";

/** Long enough for a slow login (incl. registration), short enough to bound exposure. */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

interface StoredEntry {
  value: string;
  /** Epoch ms after which the entry is treated as absent. */
  expiresAt: number;
}

function isStoredEntry(parsed: unknown): parsed is StoredEntry {
  if (typeof parsed !== "object" || parsed === null) return false;
  const entry = parsed as Record<string, unknown>;
  return typeof entry.value === "string" && typeof entry.expiresAt === "number";
}

/** Stores `value` under `key`, expiring after `ttlMs`. */
export function setResumeValue(key: string, value: string, ttlMs: number = DEFAULT_TTL_MS): void {
  try {
    const entry: StoredEntry = { value, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    logger.warn("Failed to persist auth-resume value", { key, error });
  }
}

/** Returns the stored value, or null when absent, expired or malformed. Expired/malformed entries are deleted. */
export function getResumeValue(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredEntry(parsed) || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch (error) {
    logger.warn("Failed to read auth-resume value", { key, error });
    localStorage.removeItem(key);
    return null;
  }
}

/** Deletes the stored value. Call as soon as it has been consumed. */
export function clearResumeValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    logger.warn("Failed to clear auth-resume value", { key, error });
  }
}
