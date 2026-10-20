import { Fragment } from "react";
import { Sparkle } from "lucide-react";
import { DEFAULT_TICKER_ITEMS } from "@/lib/homeLayout";

interface RallyMarqueeProps {
  readonly items?: readonly string[];
}

/**
 * Accent ticker band, tilted like tape across the page.
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
    <div className="rally-bg-accent -mx-3 my-4 -rotate-[1.2deg] overflow-hidden py-3 sm:-mx-6 sm:py-4">
      <div className="rally-marquee">
        <div className="rally-marquee-track flex items-center whitespace-nowrap">
          {doubled.map((item, i) => (
            <Fragment key={`${item}-${i}`}>
              <span className="rally-display text-2xl text-white sm:text-3xl">
                {item}
              </span>
              {/* Separator is its own flex sibling with symmetric margin, so it
                  sits exactly midway between the two adjacent labels. */}
              <span className="mx-8 text-white/70" aria-hidden="true">
                <Sparkle className="h-5 w-5" fill="currentColor" />
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RallyMarquee;
