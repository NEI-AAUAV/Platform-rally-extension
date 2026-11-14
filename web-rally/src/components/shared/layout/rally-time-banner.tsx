import { useEffect, useMemo, useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import { formatElapsed } from "@/lib/time";

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
      <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-warning-ink">
        O Rally começa em {formatElapsed(state.remaining / 1000)}
      </div>
    );
  }
  if (state.kind === "live") {
    return (
      <div className="mt-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-success-ink">
        Rally a decorrer — termina em {formatElapsed(state.remaining / 1000)}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive-ink">
      O Rally terminou há {formatElapsed(state.elapsed / 1000)}
    </div>
  );
}
