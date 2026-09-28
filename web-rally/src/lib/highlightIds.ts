/** Entity ids carried in the admin URL (`?highlight=4,7,9`) so a destination
 * tab can mark the rows a readiness issue points at. */

/** `?highlight=4,7,9` → [4, 7, 9]. Tolerates the router's JSON decoding of a
 * lone id (`4`) or an array, and drops anything that isn't a positive int. */
export function parseHighlightIds(raw: unknown): number[] {
  let parts: unknown[];
  if (Array.isArray(raw)) parts = raw;
  else if (typeof raw === "number") parts = [raw];
  else if (typeof raw === "string") parts = raw.split(",");
  else return [];
  const ids = parts
    .map((part) => (typeof part === "string" ? Number(part.trim()) : part))
    .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

export function formatHighlightIds(ids: readonly number[]): string | undefined {
  return ids.length ? ids.join(",") : undefined;
}
