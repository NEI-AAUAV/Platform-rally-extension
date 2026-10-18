import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Trophy } from "lucide-react";
import { RallyButton } from "@/components/themes/rally";
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

function rise(delay: number) {
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay },
  };
}

function StatusPill({ phase }: { readonly phase: CountdownState["phase"] }) {
  if (phase === "none") return null;
  if (phase === "live") {
    return (
      <span className="rally-bg-accent inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />A decorrer agora
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
      {phase === "pre" ? "Em breve" : "Edição terminada"}
    </span>
  );
}

/** Scoreboard-style countdown: one solid panel split into divided cells. */
function CountdownPanel({ state }: { readonly state: CountdownState }) {
  // Days only appear once there are any: hours/min/sec are remainders, so
  // dropping the days cell on a multi-day event makes it read as ending today.
  const cells = [
    ...(state.days > 0 ? [{ label: "Dias", value: state.days }] : []),
    { label: "Horas", value: state.hours },
    { label: "Min", value: state.minutes },
    { label: "Seg", value: state.seconds },
  ];
  const isLive = state.phase === "live";

  return (
    <div className="rally-elevate-lg overflow-hidden rounded-[22px] border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {isLive ? "Termina em" : "Começa em"}
        </span>
        {isLive && (
          <span className="rally-accent text-[11px] font-bold uppercase tracking-[0.2em]">
            Live
          </span>
        )}
      </div>
      <dl className="grid auto-cols-fr grid-flow-col divide-x divide-border">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center px-2 py-5 sm:py-6">
            <dd className="rally-display text-[40px] font-bold tabular-nums text-foreground sm:text-[52px]">
              {PAD(cell.value)}
            </dd>
            <dt className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {cell.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FinishedPanel({ showLeaderboard }: { readonly showLeaderboard: boolean }) {
  return (
    <div className="rally-elevate-lg rounded-[22px] border border-border bg-background p-6">
      <Trophy className="rally-accent h-8 w-8" />
      <p className="rally-display mt-4 text-2xl font-bold text-foreground">Chegámos à meta.</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Obrigado a todas as equipas. Vê como ficou a classificação final.
      </p>
      {showLeaderboard && (
        <Link
          to="/scoreboard"
          className="rally-accent mt-4 inline-flex items-center gap-1.5 rounded-md text-sm font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Classificação final <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export function HomeHero({ branding, settings, showLeaderboard = true }: HomeHeroProps) {
  const state = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const { eventName, eventSubtitle } = branding;
  // Without configured dates there is nothing to count down to: the title
  // block takes the full width instead of sitting beside an empty panel.
  const hasSchedule = state.phase !== "none";

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative overflow-hidden rounded-[28px] border border-border bg-card"
    >
      {/* race-tape band along the top edge */}
      <div aria-hidden className="rally-stripes h-2 w-full opacity-90" />

      <div
        className={`grid items-center gap-10 px-5 py-12 sm:px-10 sm:py-16 ${hasSchedule ? "lg:grid-cols-[1.3fr_1fr]" : ""} lg:gap-14 lg:py-20`}
      >
        <div className="flex flex-col items-start">
          <motion.div {...rise(0)}>
            <StatusPill phase={state.phase} />
          </motion.div>

          <motion.h1
            id="home-hero-heading"
            {...rise(0.06)}
            className="rally-display mt-6 font-bold leading-[0.88] tracking-[-0.035em] text-foreground"
            style={{ fontSize: "clamp(52px, 9vw, 112px)" }}
          >
            {eventName}
            <span aria-hidden className="rally-accent">.</span>
          </motion.h1>

          <motion.p
            {...rise(0.14)}
            className="mt-5 max-w-[38ch] text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {eventSubtitle}
          </motion.p>

          <motion.div {...rise(0.22)} className="mt-8 flex flex-wrap items-center gap-3">
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

        {hasSchedule && (
          <motion.div {...rise(0.3)} className="w-full">
            {state.phase === "post" ? (
              <FinishedPanel showLeaderboard={showLeaderboard} />
            ) : (
              <CountdownPanel state={state} />
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}

export default HomeHero;
