import { Link } from "@tanstack/react-router";
import useEventTerms from "@/hooks/useEventTerms";

/** Closing CTA band: accent-filled, left-aligned copy with a race-tape edge. */
export function HomeBottomBanner() {
  const terms = useEventTerms();
  return (
    <div className="rally-bg-accent relative overflow-hidden rounded-[28px] text-white">
      <div aria-hidden className="absolute inset-y-0 right-0 hidden w-40 opacity-25 sm:block">
        <div className="h-full w-full [background-image:repeating-linear-gradient(-45deg,#fff_0_8px,transparent_8px_16px)]" />
      </div>
      <div className="relative z-10 flex flex-col items-start gap-6 px-6 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-12 sm:py-14">
        <div>
          <h2 className="rally-display text-[34px] font-bold leading-[0.95] tracking-[-0.03em] sm:text-[52px]">
            Pronto para o {terms.event}?
          </h2>
          <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-white/85">
            Junta-te à tua equipa e começa o percurso. O primeiro check-in está a um toque.
          </p>
        </div>
        <Link
          to="/team-login"
          className="rally-accent inline-flex shrink-0 items-center gap-2 rounded-[14px] bg-white px-7 py-3.5 text-[15px] font-bold shadow-[var(--rally-shadow-md)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:mr-24"
        >
          Entrar agora →
        </Link>
      </div>
    </div>
  );
}

export default HomeBottomBanner;
