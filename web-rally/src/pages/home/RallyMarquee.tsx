const ITEMS = [
  "POSTOS",
  "EQUIPAS",
  "DESAFIOS",
  "CHECK-IN",
  "VERSUS",
  "BADGES",
  "PONTUAÇÃO AO VIVO",
  "CLASSIFICAÇÃO",
];

/**
 * Full-bleed accent ticker that scrolls the event's key concepts. CSS-driven
 * (`rally-marquee-track`), edge-masked, and paused under reduced-motion.
 */
export function RallyMarquee() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="rally-bg-accent rally-marquee w-screen max-w-full -translate-x-1/2 overflow-hidden border-y border-white/10 py-3 sm:py-3.5 [margin-left:50%]">
      <div className="rally-marquee-track flex whitespace-nowrap">
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="rally-display mx-5 text-sm font-bold uppercase tracking-[0.28em] text-white/90 sm:mx-7 sm:text-base"
          >
            {item}
            <span className="mx-4 text-white/40">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default RallyMarquee;
