import { useEffect, useMemo, useState } from "react";
import { buildDisplacementMap, supportsBackdropRefraction } from "@/lib/liquidGlass";

/**
 * Two shape families cover the app's glass: panels (cards, bars, sheets) and
 * capsules (the floating tab bar). A single map per family is stretched to
 * each element, so this mounts once.
 */
const SHAPES = [
  { id: "rally-glass-lens", radius: 0.14, bezel: 0.1, scale: 64 },
  { id: "rally-glass-lens-capsule", radius: 0.5, bezel: 0.12, scale: 56 },
] as const;

/**
 * Chromatic aberration: the three channels are displaced by slightly
 * different amounts, which is what gives real glass its coloured fringe at
 * the edge. Each pass keeps one channel and they are recombined additively.
 */
const CHANNEL_MATRICES = {
  red: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  green: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  blue: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
} as const;

/**
 * The SVG filters behind the glass material. Rendered once near the root; the
 * CSS references them by id. Renders nothing when the browser cannot use an
 * SVG filter as a backdrop-filter (Safari, Firefox), where the material falls
 * back to blur and tint alone.
 */
export function GlassFilters() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(supportsBackdropRefraction());
  }, []);

  const maps = useMemo(() => {
    if (!enabled) return null;
    return SHAPES.map((shape) => ({
      ...shape,
      href: buildDisplacementMap({ radius: shape.radius, bezel: shape.bezel }),
    })).filter((shape) => shape.href !== null);
  }, [enabled]);

  useEffect(() => {
    const root = document.documentElement;
    if (maps !== null && maps.length > 0) root.dataset.glassRefraction = "on";
    else delete root.dataset.glassRefraction;
  }, [maps]);

  if (maps === null || maps.length === 0) return null;

  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {maps.map(({ id, href, scale }) => (
          <filter key={id} id={id} colorInterpolationFilters="sRGB">
            <feImage href={href ?? undefined} preserveAspectRatio="none" result="map" />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={scale * 1.06}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced_r"
            />
            <feColorMatrix
              in="displaced_r"
              type="matrix"
              values={CHANNEL_MATRICES.red}
              result="r"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced_g"
            />
            <feColorMatrix
              in="displaced_g"
              type="matrix"
              values={CHANNEL_MATRICES.green}
              result="g"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={scale * 0.94}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced_b"
            />
            <feColorMatrix
              in="displaced_b"
              type="matrix"
              values={CHANNEL_MATRICES.blue}
              result="b"
            />

            <feBlend in="r" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b" mode="screen" result="rgb" />

            {/* Frosting, applied after refraction so the bent image is what
                gets softened, not the other way round. */}
            <feGaussianBlur in="rgb" stdDeviation="1.5" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export default GlassFilters;
