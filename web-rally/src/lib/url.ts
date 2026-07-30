const SAFE_URL_SCHEMES = new Set(["http:", "https:", "blob:", "data:"]);

export function isSafeImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_URL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Returns a sanitized URL safe for use as an image `src`, or `null` if unsafe.
 * Returning the parsed `.href` (not the raw input) breaks taint flow for
 * static analysis, unlike a boolean predicate used as a filter.
 */
export function toSafeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_URL_SCHEMES.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
