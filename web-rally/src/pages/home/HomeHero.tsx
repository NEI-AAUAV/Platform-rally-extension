import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Trophy } from "lucide-react";
import { RallyButton } from "@/components/themes/rally";
import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding";
import type { RallySettingsResponse } from "@/client";
import { useCountdown, type CountdownState } from "./useCountdown";

interface HomeHeroProps {
  readonly branding: Branding;
  readonly settings?: RallySettingsResponse | null;
  /** Privileged users retain access when the public leaderboard is disabled. */
  readonly showLeaderboard?: boolean;
}

const PAD = (n: number) => String(n).padStart(2, "0");
const EASE = [0.16, 1, 0.3, 1] as const;

/** Splits the name so its last word can carry the accent on its own line. */
function splitName(name: string): readonly [string, string] {
  const at = name.trim().lastIndexOf(" ");
  return at > 0 ? [name.slice(0, at), name.slice(at + 1)] : ["", name];
}

/** Scoreboard-style clock on an inverted slab: ink on paper, paper on night. */
function CountdownClock({ state }: { readonly state: CountdownState }) {
  // Days only appear once there are any: hours/min/sec are remainders, so
  // dropping the days cell on a multi-day event makes it read as ending today.
  const cells = [
    ...(state.days > 0 ? [{ label: "Dias", value: state.days }] : []),
    { label: "Horas", value: state.hours },
    { label: "Min", value: state.minutes },
    { label: "Seg", value: state.seconds },
  ];
  return (
    <div className="rounded-[28px] bg-foreground p-6 text-background sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-60">
        {state.phase === "pre" ? "Começa em" : "Termina em"}
      </p>
      <div className="mt-3 flex items-start">
        {cells.map((cell, i) => (
          <div key={cell.label} className="flex items-start">
            {i > 0 && (
              <span aria-hidden className="rally-display rally-accent px-1 text-6xl sm:text-8xl">
                :
              </span>
            )}
            <div className="flex flex-col">
              <span className="rally-display text-6xl tabular-nums sm:text-8xl">
                {PAD(cell.value)}
              </span>
              <span className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] opacity-60">
                {cell.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeHero({ branding, settings, showLeaderboard = true }: HomeHeroProps) {
  const state = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const { eventName, eventSubtitle } = branding;
  const [lead, last] = splitName(eventName);
  const showClock = state.phase === "pre" || state.phase === "live";

  return (
    <section
      aria-labelledby="home-hero-heading"
      className={cn(
        "grid items-end gap-10 pb-6 pt-6 sm:pt-12 lg:gap-14",
        showClock && "lg:grid-cols-[1.35fr_1fr]",
      )}
    >
      <div className="flex flex-col items-start gap-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {state.phase === "live" && (
            <span className="inline-flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.1em] text-foreground">
              <span className="relative flex h-2.5 w-2.5">
                <span className="rally-bg-accent absolute inset-0 animate-ping rounded-full opacity-60" />
                <span className="rally-bg-accent relative h-2.5 w-2.5 rounded-full" />
              </span>
              A decorrer agora
            </span>
          )}
          {state.phase === "pre" && (
            <span className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted-foreground">
              Em breve
            </span>
          )}
          {state.phase === "post" && (
            <span className="inline-flex items-center rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground">
              Edição terminada
            </span>
          )}
        </motion.div>

        <motion.h1
          id="home-hero-heading"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
          className="rally-display text-foreground"
          style={{ fontSize: "clamp(72px, 15vw, 176px)", lineHeight: 0.84 }}
        >
          {lead && <>{lead} </>}
          <span className="rally-accent block">{last}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.18 }}
          className="max-w-[34ch] text-lg leading-relaxed text-muted-foreground"
        >
          {eventSubtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.55, ease: EASE }}
          className="flex flex-wrap items-center gap-3"
        >
          <RallyButton asChild variant="primary" size="xl">
            <Link to="/team-login">
              Entrar com a Equipa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RallyButton>
          {showLeaderboard && (
            <RallyButton asChild variant="outline" size="xl">
              <Link to="/scoreboard">
                <Trophy className="h-4 w-4" />
                Ver Pontuação
              </Link>
            </RallyButton>
          )}
        </motion.div>
      </div>

      {showClock && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
        >
          <CountdownClock state={state} />
        </motion.div>
      )}
    </section>
  );
}

export default HomeHero;
