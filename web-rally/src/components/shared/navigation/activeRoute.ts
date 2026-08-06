/**
 * Whether a nav item should read as "active" for the current pathname.
 *
 * `/` only matches exactly — every other route starts with `/`, so a naive
 * prefix check would light up "Início" everywhere. Every other href matches
 * itself and its nested routes by segment (`/staff-evaluation` stays lit on
 * `/staff-evaluation/checkpoint/1`), and `aliases` covers redirect targets
 * that never carry the item's own href (e.g. the team home redirecting `/`
 * to `/team-progress`).
 */
export function isNavItemActive(
  pathname: string,
  href: string,
  aliases: readonly string[] = [],
): boolean {
  return [href, ...aliases].some((candidate) => matchesRoute(pathname, candidate));
}

function matchesRoute(pathname: string, candidate: string): boolean {
  if (candidate === "/") return pathname === "/";
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}
