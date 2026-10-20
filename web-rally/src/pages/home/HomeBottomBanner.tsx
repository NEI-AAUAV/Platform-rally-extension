import { Link } from "@tanstack/react-router";
import useEventTerms from "@/hooks/useEventTerms";

/**
 * Closing CTA band — accent-filled, centered, with faint grid texture.
 */
export function HomeBottomBanner() {
  const terms = useEventTerms();
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-foreground text-background">
      <div
        aria-hidden
        className="rally-bg-accent pointer-events-none absolute -right-16 -top-16 hidden h-56 w-56 rotate-12 rounded-[48px] sm:block"
      />
      <div className="relative z-10 px-6 py-10 sm:px-12 sm:py-16">
        <h2 className="rally-display m-0 max-w-[12ch] text-5xl sm:text-8xl">
          Pronto para o {terms.event}?
        </h2>
        <p className="mb-7 mt-4 max-w-[42ch] text-base leading-relaxed opacity-70">
          Junta-te à tua equipa e começa o percurso. O primeiro check-in está a um toque.
        </p>
        <Link
          to="/team-login"
          className="rally-bg-accent rally-press inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold text-white"
        >
          Entrar com a Equipa →
        </Link>
      </div>
    </div>
  );
}

export default HomeBottomBanner;
