/**
 * Gooey-merge filter for iOS liquid-glass interactions (see .liquid-goo-container
 * in global.css, scoped to iOS only). Unlike GlassFilters, this is a plain
 * `filter` (not a backdrop-filter), which WebKit has supported natively for
 * years — no capability check needed, mount unconditionally.
 */
export function GooFilter() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="liquid-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

export default GooFilter;
