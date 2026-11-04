import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * One chestnut per entry. Fixed (not random) so renders are stable and the
 * scatter is hand-tuned: spread across the width, staggered so they never
 * fall in rows, mixed sizes for depth (smaller = further away = slower).
 */
const CHESTNUTS: ReadonlyArray<{
  left: number; // % of container width
  size: number; // px
  duration: number; // s for one fall
  delay: number; // s (negative = already mid-fall on first paint)
  sway: number; // px of side-to-side drift
  spin: number; // deg of rotation over one sway
}> = [
  { left: 4, size: 22, duration: 15, delay: -2, sway: 18, spin: 40 },
  { left: 13, size: 14, duration: 21, delay: -11, sway: 12, spin: -30 },
  { left: 22, size: 26, duration: 13, delay: -7, sway: 22, spin: 55 },
  { left: 31, size: 16, duration: 19, delay: -16, sway: 14, spin: -45 },
  { left: 42, size: 20, duration: 16, delay: -4, sway: 20, spin: 35 },
  { left: 51, size: 12, duration: 23, delay: -19, sway: 10, spin: -25 },
  { left: 60, size: 24, duration: 14, delay: -9, sway: 24, spin: 50 },
  { left: 69, size: 15, duration: 20, delay: -1, sway: 12, spin: -40 },
  { left: 77, size: 21, duration: 17, delay: -13, sway: 18, spin: 30 },
  { left: 86, size: 13, duration: 22, delay: -6, sway: 10, spin: -35 },
  { left: 93, size: 25, duration: 15, delay: -10, sway: 20, spin: 45 },
  { left: 36, size: 11, duration: 25, delay: -21, sway: 8, spin: 20 },
];

/** A roasted chestnut: glossy brown shell, pale base (hilum) and a small tip. */
function Chestnut({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden focusable="false">
      <defs>
        <radialGradient id="rally-chestnut-shell" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#a0522d" />
          <stop offset="55%" stopColor="#6b2f12" />
          <stop offset="100%" stopColor="#3b1a0a" />
        </radialGradient>
      </defs>
      {/* tip */}
      <path d="M19 4.5 L20 1.5 L21.2 4.5 Z" fill="#c8a27a" />
      {/* shell */}
      <path
        d="M20 4 C24.5 8.5 36 14 36 25.5 C36 32.5 29 36.5 20 36.5 C11 36.5 4 32.5 4 25.5 C4 14 15.5 8.5 20 4 Z"
        fill="url(#rally-chestnut-shell)"
      />
      {/* pale base */}
      <path
        d="M5.2 28.5 C9 34.5 31 34.5 34.8 28.5 C33.5 34.5 27.5 37 20 37 C12.5 37 6.5 34.5 5.2 28.5 Z"
        fill="#d9b88f"
      />
      {/* gloss */}
      <ellipse
        cx="13.5"
        cy="18"
        rx="2.6"
        ry="6"
        fill="#fff"
        opacity="0.28"
        transform="rotate(28 13.5 18)"
      />
    </svg>
  );
}

interface FallingChestnutsProps {
  /** Fill the nearest positioned parent instead of the viewport (admin preview). */
  readonly contained?: boolean;
  readonly className?: string;
}

/** Decorative falling chestnuts for the Magusto background style. */
export function FallingChestnuts({ contained = false, className }: FallingChestnutsProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "rally-chestnuts pointer-events-none inset-0 overflow-hidden",
        contained ? "absolute -z-10" : "fixed z-0",
        className,
      )}
    >
      {CHESTNUTS.map((c) => (
        <span
          key={`${c.left}-${c.size}`}
          className="rally-chestnut"
          style={
            {
              left: `${c.left}%`,
              "--chestnut-size": `${c.size}px`,
              "--chestnut-duration": `${c.duration}s`,
              "--chestnut-delay": `${c.delay}s`,
              "--chestnut-sway": `${c.sway}px`,
              "--chestnut-spin": `${c.spin}deg`,
              // Smaller ones read as further away.
              opacity: 0.45 + (c.size / 26) * 0.45,
            } as CSSProperties
          }
        >
          <span className="rally-chestnut-sway">
            <Chestnut size={c.size} />
          </span>
        </span>
      ))}
    </div>
  );
}

export default FallingChestnuts;
