import { Link } from "@tanstack/react-router";
import useEventTerms from "@/hooks/useEventTerms";

/**
 * Closing CTA band — accent-filled, centered, with faint grid texture.
 */
export function HomeBottomBanner() {
  const terms = useEventTerms();
  return (
    <div className="rally-bg-accent relative overflow-hidden rounded-[22px] text-center text-white">
      {/* grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:34px_34px]"
      />
      <div className="relative z-10 px-6 py-12 sm:px-10 sm:py-[48px]">
        <h2 className="rally-display m-0 text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[40px]">
          Pronto para o {terms.event}?
        </h2>
        <p className="mx-auto mb-[22px] mt-3 max-w-[42ch] text-[15px] leading-relaxed opacity-90">
          Junta-te à tua equipa e começa o percurso. O primeiro check-in está a um toque.
        </p>
        <Link
          to="/team-login"
          className="rally-accent inline-flex items-center gap-2 rounded-[14px] bg-white px-7 py-3.5 text-[15px] font-bold transition-opacity hover:opacity-90"
        >
          Entrar agora →
        </Link>
      </div>
    </div>
  );
}

export default HomeBottomBanner;
