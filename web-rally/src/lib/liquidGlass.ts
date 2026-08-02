/**
 * Displacement maps for the glass refraction filter.
 *
 * Apple's Liquid Glass bends what is behind it near the edges, like a real
 * lens. CSS has no such primitive, so the standard web technique — used by
 * every open-source recreation — is an SVG `feDisplacementMap` fed a texture
 * whose red and green channels encode how far each pixel should move:
 *
 *   red   = 128 + dx * 127   (0 = -scale, 128 = no shift, 255 = +scale)
 *   green = 128 + dy * 127
 *   blue  = a baked specular mask, used for the lit edge
 *
 * The geometry comes from a rounded-rectangle signed distance field: pixels
 * inside the bezel band along the border are pushed along the inward normal,
 * with the strongest bend right at the edge, and the centre is left neutral so
 * content behind the middle of the pane stays legible.
 *
 * One map serves every element of a given shape family: the <feImage> is
 * stretched with preserveAspectRatio="none", so the map is authored in a
 * normalised square and resized to whatever the element happens to be.
 */

export interface DisplacementMapOptions {
  /** Texture resolution in px. 256 is plenty — it gets stretched anyway. */
  readonly size?: number;
  /** Corner radius as a fraction of the square (0.5 = capsule). */
  readonly radius: number;
  /** Width of the refracting band, as a fraction of the square. */
  readonly bezel: number;
  /** Peak displacement, normalised. Multiplied by the filter's `scale`. */
  readonly strength?: number;
}

const LIGHT_X = -0.55;
const LIGHT_Y = -0.83;

/** Signed distance to a rounded rectangle centred on the origin. */
function roundedRectSdf(
  px: number,
  py: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): number {
  const qx = Math.abs(px) - halfWidth + radius;
  const qy = Math.abs(py) - halfHeight + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Render the displacement texture and return it as a data URL.
 *
 * Returns null when there is no canvas to draw on (SSR, or a browser that
 * refuses the 2D context), which callers treat as "no refraction".
 */
export function buildDisplacementMap({
  size = 256,
  radius,
  bezel,
  strength = 1,
}: DisplacementMapOptions): string | null {
  if (globalThis.document === undefined) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  const image = ctx.createImageData(size, size);
  const data = image.data;
  const half = 0.5;
  const step = 1 / size;

  for (let y = 0; y < size; y++) {
    const py = (y + 0.5) * step - half;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * step - half;
      const distance = roundedRectSdf(px, py, half, half, radius);

      // Gradient of the SDF = the outward surface normal.
      const eps = step;
      const nx =
        roundedRectSdf(px + eps, py, half, half, radius) -
        roundedRectSdf(px - eps, py, half, half, radius);
      const ny =
        roundedRectSdf(px, py + eps, half, half, radius) -
        roundedRectSdf(px, py - eps, half, half, radius);
      const length = Math.hypot(nx, ny) || 1;
      const unitX = nx / length;
      const unitY = ny / length;

      // Only the band just inside the edge refracts; ease it to zero so the
      // transition into the flat centre is not a visible ring.
      const depth = -distance; // positive inside
      const band = depth >= 0 && depth < bezel ? 1 - depth / bezel : 0;
      const falloff = band * band * (3 - 2 * band); // smoothstep
      const magnitude = falloff * strength;

      // Pull the backdrop outward along the normal: light entering the bevel
      // is bent away from the centre, which is what makes the edge read as
      // thick glass rather than a painted border.
      const dx = unitX * magnitude;
      const dy = unitY * magnitude;

      const specular = Math.max(0, unitX * LIGHT_X + unitY * LIGHT_Y) * falloff;

      const i = (y * size + x) * 4;
      data[i] = Math.round(128 + Math.max(-1, Math.min(1, dx)) * 127);
      data[i + 1] = Math.round(128 + Math.max(-1, Math.min(1, dy)) * 127);
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Whether the browser can refract the live backdrop.
 *
 * Chromium accepts an SVG filter as a `backdrop-filter` value; Safari and
 * Firefox do not, and there is no way to refract what is behind an element
 * without it. Those browsers fall back to the blurred, tinted material.
 */
export function supportsBackdropRefraction(): boolean {
  if (globalThis.CSS?.supports === undefined) return false;
  return CSS.supports("backdrop-filter", "url(#rally-glass-lens)");
}
