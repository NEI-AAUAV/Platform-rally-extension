import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Trophy, Users } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { RallySettingsResponse } from "@/client";
import { useCountdown, type CountdownState } from "./useCountdown";
import { Typewriter } from "./Typewriter";

interface HomeHeroProps {
  readonly branding: Branding;
  readonly settings?: RallySettingsResponse | null;
}

const PAD = (n: number) => String(n).padStart(2, "0");
const EASE = [0.16, 1, 0.3, 1] as const;

function CountdownDigits({ state }: { readonly state: CountdownState }) {
  const cells = [
    { label: "Dias", value: state.days },
    { label: "Horas", value: state.hours },
    { label: "Min", value: state.minutes },
    { label: "Seg", value: state.seconds },
  ];
  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rally-surface rally-elevate flex min-w-[4rem] flex-col items-center px-3 py-2.5 sm:min-w-[5rem] sm:py-3"
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

/**
 * Full-height landing hero: layered accent atmosphere behind a centered event
 * identity (logo, typed title, subtitle), a live countdown/phase pill and the
 * primary calls to action. Text-forward — the cover banner is rendered above by
 * the shared BrandHeader, so this never duplicates the artwork.
 */
export function HomeHero({ branding, settings }: HomeHeroProps) {
  const state = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const { eventName, eventSubtitle, logoSrc } = branding;

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative flex min-h-[34rem] flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card/40 px-5 py-16 text-center sm:min-h-[40rem] sm:px-10"
    >
      {/* layered accent atmosphere */}
      <div
        aria-hidden
        className="rally-bg-accent-soft pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="rally-bg-accent-soft pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:40px_40px]"
      />

      <div className="relative z-10 flex flex-col items-center">
        {logoSrc && (
          <motion.img
            src={logoSrc}
            alt={eventName}
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="mb-7 h-24 w-24 rounded-2xl object-contain drop-shadow-xl sm:h-32 sm:w-32"
          />
        )}

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="rally-accent text-xs font-semibold uppercase tracking-[0.28em] sm:text-sm"
        >
          {eventSubtitle}
        </motion.p>

        <h1
          id="home-hero-heading"
          className="rally-display mt-4 text-5xl font-bold leading-[0.92] text-foreground sm:text-7xl md:text-8xl"
        >
          <Typewriter text={eventName} delay={400} />
        </h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.7 }}
          className="mt-10"
        >
          {state.phase === "pre" && (
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Começa em
              </p>
              <CountdownDigits state={state} />
            </div>
          )}
          {state.phase === "live" && (
            <span className="rally-bg-accent inline-flex items-center gap-2 rounded-full px-5 py-2 text-base font-semibold text-white">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              A decorrer agora
            </span>
          )}
          {state.phase === "post" && (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-5 py-2 text-base font-semibold text-secondary-foreground">
              Edição terminada
            </span>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: EASE }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/team-login"
            className="rally-bg-accent rally-press inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold text-white"
          >
            <Users className="h-4 w-4" />
            Entrar com a Equipa
          </Link>
          <Link
            to="/scoreboard"
            className="rally-press inline-flex items-center gap-2 rounded-xl border border-border bg-card px-7 py-3.5 font-semibold text-foreground hover:bg-accent"
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
