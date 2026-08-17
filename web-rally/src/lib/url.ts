const SAFE_URL_SCHEMES = new Set(["http:", "https:", "blob:", "data:"]);

/** The router's basepath, e.g. "/rally" when the app is served from /rally/. */
const ROUTER_BASEPATH = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Converts a browser location path (which includes the deploy basepath) into a
 * router-relative path.
 *
 * The router is created with `basepath`, so every `navigate({ to })` prepends it
 * again. Feeding it `window.location.pathname` verbatim yields `/rally/rally/...`.
 */
export function toRouterPath(browserPath: string, basepath: string = ROUTER_BASEPATH): string {
  if (!basepath || basepath === "/") return browserPath;
  if (browserPath === basepath) return "/";
  if (!browserPath.startsWith(`${basepath}/`)) return browserPath;
  return browserPath.slice(basepath.length);
}

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
