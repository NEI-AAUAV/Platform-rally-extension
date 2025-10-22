import { useEffect, useMemo, useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    `${seconds}s`,
  ].filter(Boolean);
  return parts.join(" ");
}

export default function RallyTimeBanner() {
  const { settings } = useRallySettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = useMemo(() => {
    if (!settings) return null;

    const start = settings.rally_start_time ? Date.parse(settings.rally_start_time) : undefined;
    const end = settings.rally_end_time ? Date.parse(settings.rally_end_time) : undefined;

    if (start && now < start) {
      return { kind: "pre", remaining: start - now } as const;
    }
    if (end && now > end) {
      return { kind: "post", elapsed: now - end } as const;
    }
    if (start && end && now >= start && now <= end) {
      return { kind: "live", remaining: end - now } as const;
    }
    return null;
  }, [settings, now]);

  if (!state) return null;

  if (state.kind === "pre") {
    return (
      <div className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-yellow-100">
        O Rally começa em {formatDuration(state.remaining)}
      </div>
    );
  }
  if (state.kind === "live") {
    return (
      <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-100">
        Rally a decorrer — termina em {formatDuration(state.remaining)}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-100">
      O Rally terminou há {formatDuration(state.elapsed)}
    </div>
  );
}
