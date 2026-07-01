import { DEFAULT_TICKER_ITEMS } from "@/lib/homeLayout";

interface RallyMarqueeProps {
  readonly items?: readonly string[];
}

/**
 * Contained accent ticker strip with rounded corners.
 * CSS-driven, edge-masked, paused under reduced-motion.
 */
export function RallyMarquee({ items }: RallyMarqueeProps) {
  const list = items?.length ? items : DEFAULT_TICKER_ITEMS;
  const doubled = [...list, ...list];

  return (
    <div className="overflow-hidden rounded-[16px] border border-border rally-bg-accent py-[11px]">
      <div className="rally-marquee">
        <div className="rally-marquee-track flex whitespace-nowrap">
          {doubled.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="rally-display mx-[22px] text-sm font-bold uppercase tracking-[0.04em] text-white"
            >
              {item}
              <span className="mx-3 text-white/50">✦</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RallyMarquee;
