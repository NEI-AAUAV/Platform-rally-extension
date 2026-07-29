import { Fragment } from "react";
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
  // The track scrolls by -50% for a seamless loop, so each half must be at
  // least as wide as the strip or empty space trails before it repeats. With
  // only a handful of short labels one copy is too narrow, so each half packs
  // two copies of the list.
  const half = [...list, ...list];
  const doubled = [...half, ...half];

  return (
    <div className="rally-bg-accent overflow-hidden rounded-[16px] border border-border py-[11px]">
      <div className="rally-marquee">
        <div className="rally-marquee-track flex items-center whitespace-nowrap">
          {doubled.map((item, i) => (
            <Fragment key={`${item}-${i}`}>
              <span className="rally-display text-sm font-bold uppercase tracking-[0.04em] text-white">
                {item}
              </span>
              {/* Separator is its own flex sibling with symmetric margin, so it
                  sits exactly midway between the two adjacent labels. */}
              <span className="mx-[56px] text-white/50" aria-hidden="true">
                ✦
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RallyMarquee;
