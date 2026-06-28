import { Link } from "@tanstack/react-router";

/**
 * Closing CTA band — accent-filled, centered, with faint grid texture.
 */
export function HomeBottomBanner() {
  return (
    <div className="relative overflow-hidden rounded-[22px] rally-bg-accent text-white text-center">
      {/* grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:34px_34px]"
      />
      <div className="relative z-10 px-6 py-12 sm:px-10 sm:py-[48px]">
        <h2 className="rally-display font-bold text-[28px] sm:text-[40px] m-0 leading-tight tracking-[-0.02em]">
          Pronto para a prova?
        </h2>
        <p className="mt-3 mb-[22px] mx-auto max-w-[42ch] opacity-90 text-[15px] leading-relaxed">
          Junta-te à tua equipa e começa o percurso. O primeiro check-in está a um toque.
        </p>
        <Link
          to="/team-login"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[14px] bg-white font-bold text-[15px] rally-accent hover:opacity-90 transition-opacity"
        >
          Entrar agora →
        </Link>
      </div>
    </div>
  );
}

export default HomeBottomBanner;
