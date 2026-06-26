import type { CSSProperties } from "react";

/**
 * The rally surface background is now owned by the layout via the dual
 * light/dark design tokens (bg-background), so the themed background is empty.
 * Kept for API compatibility with the theme-components contract.
 */
export const rallyBackground: CSSProperties = {};

export default rallyBackground;
