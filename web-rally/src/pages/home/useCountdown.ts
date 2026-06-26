import { useEffect, useMemo, useState } from "react";

export type CountdownPhase = "pre" | "live" | "post" | "none";

export interface CountdownState {
  readonly phase: CountdownPhase;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

const SECOND = 1000;

function breakdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / SECOND));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Live countdown derived from the event's start/end times. Ticks once per
 * second only while there is something to count toward (pre/live), so an event
 * with no schedule, or one already over, does not spin a timer needlessly.
 */
export function useCountdown(
  startIso?: string | null,
  endIso?: string | null,
): CountdownState {
  const start = startIso ? Date.parse(startIso) : Number.NaN;
  const end = endIso ? Date.parse(endIso) : Number.NaN;

  const [now, setNow] = useState(() => Date.now());

  const phase: CountdownPhase = useMemo(() => {
    if (!Number.isNaN(start) && now < start) return "pre";
    if (!Number.isNaN(end) && now > end) return "post";
    if (!Number.isNaN(start) && now >= start && (Number.isNaN(end) || now <= end)) return "live";
    return "none";
  }, [start, end, now]);

  useEffect(() => {
    if (phase !== "pre" && phase !== "live") return;
    const id = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(id);
  }, [phase]);

  const target = phase === "pre" ? start : end;
  const remaining = Number.isNaN(target) ? 0 : target - now;

  return { phase, ...breakdown(remaining) };
}
