import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Trophy, Users } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { RallySettingsResponse } from "@/client";
import { useCountdown, type CountdownState } from "./useCountdown";

interface HomeHeroProps {
  readonly branding: Branding;
  readonly settings?: RallySettingsResponse | null;
}

const PAD = (n: number) => String(n).padStart(2, "0");
const EASE = [0.16, 1, 0.3, 1] as const;

function CountdownDigits({ state }: { readonly state: CountdownState }) {
  const cells = [
    { label: "Horas", value: state.hours },
    { label: "Min", value: state.minutes },
    { label: "Seg", value: state.seconds },
  ];
  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rally-surface rally-elevate flex min-w-[4.5rem] flex-col items-center px-3 py-3 sm:min-w-[5.5rem] sm:py-3.5"
        >
          <span className="rally-display text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
            {PAD(cell.value)}
          </span>
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {cell.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HomeHero({ branding, settings }: HomeHeroProps) {
  const state = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const { eventName, eventSubtitle } = branding;

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative flex min-h-[34rem] flex-col items-center justify-center overflow-hidden rounded-[26px] border border-border bg-card/40 px-5 py-16 text-center sm:min-h-[42rem] sm:px-10"
    >
      {/* soft blobs */}
      <div
        aria-hidden
        className="rally-bg-accent-soft pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="rally-bg-accent-soft pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full blur-3xl"
      />
      {/* grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:34px_34px]"
      />

      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-7">
        {/* live / pre pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {state.phase === "live" && (
            <span className="rally-bg-accent inline-flex items-center gap-2 rounded-full px-5 py-[7px] text-sm font-bold uppercase tracking-[0.06em] text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              A decorrer agora
            </span>
          )}
          {state.phase === "pre" && (
            <span className="inline-flex items-center rounded-full border border-border bg-card px-5 py-[7px] text-sm font-semibold text-muted-foreground">
              Em breve
            </span>
          )}
          {state.phase === "post" && (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-5 py-[7px] text-sm font-semibold text-secondary-foreground">
              Edição terminada
            </span>
          )}
        </motion.div>

        {/* giant event name */}
        <div>
          <motion.h1
            id="home-hero-heading"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
            className="rally-display font-bold leading-[0.9] tracking-[-0.02em] text-foreground"
            style={{ fontSize: "clamp(48px, 10vw, 108px)" }}
          >
            {eventName}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.18 }}
            className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base mx-auto max-w-[30ch]"
          >
            {eventSubtitle}
          </motion.p>
        </div>

        {/* countdown */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
        >
          {state.phase === "pre" && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Começa em
              </p>
              <CountdownDigits state={state} />
            </div>
          )}
          {state.phase === "live" && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Termina em
              </p>
              <CountdownDigits state={state} />
            </div>
          )}
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.55, ease: EASE }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/team-login"
            className="rally-bg-accent rally-press inline-flex items-center gap-2 rounded-[14px] px-7 py-3.5 font-bold text-[15px] text-white"
          >
            <Users className="h-4 w-4" />
            Entrar com a Equipa
          </Link>
          <Link
            to="/scoreboard"
            className="rally-press inline-flex items-center gap-2 rounded-[14px] border border-border bg-card px-7 py-3.5 font-bold text-[15px] text-foreground hover:bg-muted/50 transition-colors"
          >
            <Trophy className="h-4 w-4" />
            Ver Pontuação
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default HomeHero;
