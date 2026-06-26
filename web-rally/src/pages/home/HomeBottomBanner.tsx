import { Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";

/**
 * Closing call-to-action band. Accent-filled, soft-depth, with faint geometric
 * motifs — the rally analogue of the gamification bottom banner.
 */
export function HomeBottomBanner() {
  return (
    <div className="rally-bg-accent rally-shadow-accent relative overflow-hidden rounded-2xl text-white">
      {/* faint geometric motifs */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 opacity-15 sm:h-56 sm:w-56"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="50" cy="50" r="9" fill="currentColor" />
      </svg>
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 opacity-15 sm:h-44 sm:w-44"
        viewBox="0 0 100 100"
      >
        <rect x="12" y="12" width="76" height="76" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="34" y="34" width="32" height="32" fill="currentColor" />
      </svg>

      <div className="relative flex flex-col items-center gap-5 p-7 text-center sm:p-10 md:flex-row md:justify-between md:text-left">
        <div>
          <h3 className="rally-display text-2xl font-bold sm:text-3xl">
            Junta-te ao rally
          </h3>
          <p className="mt-2 max-w-md text-sm font-medium text-white/85 sm:text-base">
            Entra com a tua equipa, percorre os postos e luta pelo topo da
            classificação ao vivo.
          </p>
        </div>
        <Link
          to="/team-login"
          className="rally-press inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-foreground"
        >
          <Users className="h-4 w-4" />
          Entrar com a Equipa
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default HomeBottomBanner;
