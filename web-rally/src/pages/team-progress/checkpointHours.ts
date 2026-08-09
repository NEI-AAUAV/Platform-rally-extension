import type { DetailedCheckPoint } from "@/client";

/**
 * What to tell a team about a post that is not open yet, or already closed.
 *
 * The server refuses the check-in either way (see
 * `api-rally/app/services/route_progress.py`); this is the same rule read
 * client-side so the button is not offered in the first place. Returns null
 * when the post has no window, or is inside it.
 */
export function checkpointOpeningNotice(
  checkpoint: Pick<DetailedCheckPoint, "available_from" | "available_until">,
  now: Date = new Date(),
): string | null {
  const from = parseDate(checkpoint.available_from);
  const until = parseDate(checkpoint.available_until);

  if (from && now < from) {
    return `Este posto ainda não abriu. Abre às ${formatTime(from)}.`;
  }
  if (until && now > until) {
    return `Este posto já fechou (às ${formatTime(until)}).`;
  }
  return null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTime(date: Date): string {
  // Hour and minute only: the window always falls inside the event, so the
  // date would be noise.
  return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}
