import { Link } from "@tanstack/react-router";
import { Trophy, Users } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { RallySettingsResponse } from "@/client";
import { useCountdown, type CountdownState } from "./useCountdown";

interface HomeHeroProps {
  readonly branding: Branding;
  readonly settings?: RallySettingsResponse | null;
}

const PAD = (n: number) => String(n).padStart(2, "0");

function CountdownDigits({ state }: { readonly state: CountdownState }) {
  const cells = [
    { label: "Dias", value: state.days },
    { label: "Horas", value: state.hours },
    { label: "Min", value: state.minutes },
    { label: "Seg", value: state.seconds },
  ];
  return (
    <div className="flex gap-2 sm:gap-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rally-surface flex min-w-[3.75rem] flex-col items-center px-3 py-2 sm:min-w-[4.5rem]"
        >
          <span className="rally-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
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
 * Public landing hero: event identity, a live countdown to the start (or a
 * status pill once it is live / over) and the primary calls to action. The
 * cover banner is rendered above by the shared BrandHeader, so this stays text-
 * forward to avoid duplicating it.
 */
export function HomeHero({ branding, settings }: HomeHeroProps) {
  const state = useCountdown(settings?.rally_start_time, settings?.rally_end_time);

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative overflow-hidden rounded-2xl border border-border bg-card/50 px-5 py-10 sm:px-10 sm:py-14"
    >
      {/* ambient accent wash */}
      <div
        aria-hidden
        className="rally-bg-accent-soft pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
      />
      <div className="relative max-w-2xl">
        <p className="rally-accent text-xs font-semibold uppercase tracking-[0.22em]">
          {branding.eventSubtitle}
        </p>
        <h1
          id="home-hero-heading"
          className="rally-display mt-3 text-4xl font-bold leading-[0.95] text-foreground sm:text-6xl"
        >
          {branding.eventName}
        </h1>

        <div className="mt-7">
          {state.phase === "pre" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Começa em</p>
              <CountdownDigits state={state} />
            </div>
          )}
          {state.phase === "live" && (
            <span className="rally-bg-accent inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              A decorrer agora
            </span>
          )}
          {state.phase === "post" && (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground">
              Edição terminada
            </span>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/team-login"
            className="rally-bg-accent rally-press inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white"
          >
            <Users className="h-4 w-4" />
            Entrar com a Equipa
          </Link>
          <Link
            to="/scoreboard"
            className="rally-press inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-semibold text-foreground hover:bg-accent"
          >
            <Trophy className="h-4 w-4" />
            Ver Pontuação
          </Link>
        </div>
      </div>
    </section>
  );
}

export default HomeHero;
