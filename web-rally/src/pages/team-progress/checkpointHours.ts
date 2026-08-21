/**
 * What to tell a team about a post that is not open yet, or already closed.
 *
 * The server refuses the check-in either way (see
 * `api-rally/app/services/route_progress.py`); this is the same rule read
 * client-side so the button is not offered in the first place. Returns null
 * when the post has no window, or is inside it.
 *
 * `hoursEnforced` mirrors the event's `checkpoint_hours_enabled`, which is the
 * organizer's escape hatch for the bar that opened early — its own help text
 * says it is "mais rápido do que limpar os horários um a um". Without it here
 * the switch was honoured by the server and ignored by the client: the
 * organizer flipped it, the server started accepting check-ins, and the teams
 * still saw "ainda não abriu" with no button to press.
 */
export function checkpointOpeningNotice(
  checkpoint: {
    available_from?: string | null;
    available_until?: string | null;
  },
  now: Date = new Date(),
  hoursEnforced = true,
): string | null {
  if (!hoursEnforced) return null;
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


/**
 * What to tell a team whose own departure has not come round yet.
 *
 * Same shape as the opening notice above, and the same reason: the server
 * refuses progress before a team's start (`TeamService.validate_rally_timing`),
 * so offering the check-in button until then means the team presses it and
 * gets a raw English rejection back. A staggered start is the normal case for
 * a peddy paper — everyone walks the same route, so the departures are spread
 * out — and "sais às 10:20" is an answer where "Rally has not started" is not.
 */
export function departureNotice(
  rallyStartTime: string | null | undefined,
  startOffsetMinutes: number,
  now: Date = new Date(),
): string | null {
  const start = parseDate(rallyStartTime);
  if (!start) return null;
  const departure = new Date(start.getTime() + startOffsetMinutes * 60_000);
  if (now >= departure) return null;
  return `A vossa partida é às ${formatTime(departure)}. Até lá não há check-in.`;
}
