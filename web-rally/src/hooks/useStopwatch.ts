import { useState, useEffect, useRef, useCallback } from "react";
import { useWakeLock } from "./useWakeLock";

export interface Lap {
  n: number;
  elapsed: number;
  split: number;
}

export function formatStopwatchTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`
    : `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

export function useStopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (startRef.current !== null) {
      setElapsed(baseRef.current + (Date.now() - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const start = useCallback(() => {
    startRef.current = Date.now();
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (startRef.current !== null) {
      baseRef.current += Date.now() - startRef.current;
      startRef.current = null;
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    pause();
    baseRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setLaps([]);
  }, [pause]);

  const lap = useCallback(() => {
    setLaps((ls) => {
      const prev = ls.length > 0 ? ls[ls.length - 1]!.elapsed : 0;
      return [...ls, { n: ls.length + 1, elapsed, split: elapsed - prev }];
    });
  }, [elapsed]);

  // Keep the screen on while timing: nobody is touching the phone, and a
  // display timeout mid-activity means unlocking to read the clock.
  useWakeLock(running);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { running, elapsed, laps, start, pause, reset, lap };
}
