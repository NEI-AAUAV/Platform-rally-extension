const SAFE_URL_SCHEMES = ["http:", "https:", "blob:", "data:"];

export function isSafeImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}
