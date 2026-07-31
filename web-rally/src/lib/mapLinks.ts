/**
 * Map deep links that respect the user's platform.
 *
 * Apple devices open `maps.apple.com` in Apple Maps (and, inside a standalone
 * PWA, without kicking the user out to a browser tab first), while a Google
 * Maps URL forces either the browser or an app the user may not have. Everyone
 * else keeps the Google Maps links.
 */

export interface MapCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * True on iOS, iPadOS and macOS. iPadOS 13+ reports a desktop `Macintosh` user
 * agent, so touch support is what separates it from a real Mac — but both want
 * Apple Maps anyway, hence the single check covering the whole Apple family.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/.test(ua) && !/Android/.test(ua);
}

const coord = ({ latitude, longitude }: MapCoordinates) => `${latitude},${longitude}`;

/** Turn-by-turn directions to a single destination. */
export function directionsUrl(destination: MapCoordinates): string {
  return isApplePlatform()
    ? `https://maps.apple.com/?daddr=${coord(destination)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${coord(destination)}`;
}

/**
 * A multi-stop route. Apple Maps has no `waypoints` parameter; it chains stops
 * with `+to:` off `daddr`, and the first stop doubles as the starting point.
 */
export function routeUrl(stops: readonly MapCoordinates[]): string | null {
  if (stops.length === 0) return null;

  if (isApplePlatform()) {
    return `https://maps.apple.com/?daddr=${stops.map(coord).join("+to:")}`;
  }

  return `https://www.google.com/maps/dir/?api=1&waypoints=${stops.map(coord).join("|")}`;
}
