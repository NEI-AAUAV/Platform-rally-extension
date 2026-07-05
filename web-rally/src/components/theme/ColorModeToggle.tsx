import { useCallback, useRef, useState } from "react";
import { useColorMode } from "./useColorMode";

interface ColorModeToggleProps {
  readonly className?: string;
}

const PULL_THRESHOLD = 8;
const PULL_MAX = 16;
const CORD_REST_Y = 32;
const SVG_HEIGHT = 36;
const VIEWBOX_HEIGHT = 44;
const SCALE = VIEWBOX_HEIGHT / SVG_HEIGHT;

/** Pull-cord lamp switch: drag the cord down to toggle, bulb glows on light mode. */
export function ColorModeToggle({ className = "" }: ColorModeToggleProps) {
  const { mode, toggle } = useColorMode();
  const isOn = mode === "light";
  const next = isOn ? "escuro" : "claro";

  const dragging = useRef(false);
  const startY = useRef(0);
  const [pull, setPull] = useState(0);
  const [snapping, setSnapping] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = true;
    startY.current = e.clientY;
    setSnapping(false);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = (e.clientY - startY.current) * SCALE;
    setPull(Math.max(0, Math.min(delta, PULL_MAX)));
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      setSnapping(true);

      if (pull > PULL_THRESHOLD) {
        toggle({ clientX: e.clientX, clientY: e.clientY });
      }
      setPull(0);
    },
    [pull, toggle],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (pull > 0) return;
      toggle({ clientX: e.clientX, clientY: e.clientY });
    },
    [pull, toggle],
  );

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ width: 36, height: 36, cursor: "pointer", userSelect: "none", touchAction: "none" }}
      title={`Modo ${next}`}
    >
      <svg
        viewBox="0 -6 32 44"
        width="26"
        height="36"
        onClick={handleClick}
        className="text-foreground/80 transition-colors hover:text-foreground"
        style={{ overflow: "visible" }}
      >
        {/* Wire from top */}
        <line x1="16" y1="0" x2="16" y2="4" stroke="currentColor" strokeWidth="1" opacity={0.5} />

        {/* Cap / socket */}
        <rect x="12" y="4" width="8" height="4" fill="currentColor" opacity={0.7} />

        {/* Bulb glass */}
        <path
          d="M12 8 C12 8 9 12 9 16 C9 20 12 22 16 22 C20 22 23 20 23 16 C23 12 20 8 20 8 Z"
          fill={isOn ? "#e8e0c8" : "var(--color-muted)"}
          stroke="currentColor"
          strokeWidth="1.5"
        />

        {/* Glow behind filament */}
        <ellipse
          cx="16"
          cy="15"
          rx="5"
          ry="5"
          fill="#ffeaa7"
          opacity={isOn ? 1 : 0}
          style={{ transition: "opacity 0.3s ease" }}
        />

        {/* Filament */}
        <path
          d="M14 18 L14.5 12 L16 15 L17.5 12 L18 18"
          stroke="#e67e22"
          strokeWidth="1"
          fill="none"
          opacity={isOn ? 1 : 0.3}
          style={{ transition: "opacity 0.2s ease" }}
        />

        {/* Shine highlight */}
        <ellipse
          cx="13"
          cy="13"
          rx="1.5"
          ry="2"
          fill="white"
          opacity={isOn ? 0.6 : 0}
          style={{ transition: "opacity 0.3s ease" }}
        />

        {/* Light rays */}
        <g stroke="#ffeaa7" strokeWidth="0.5" opacity={isOn ? 0.4 : 0} style={{ transition: "opacity 0.3s ease" }}>
          <line x1="6" y1="10" x2="4" y2="8" />
          <line x1="5" y1="16" x2="2" y2="16" />
          <line x1="6" y1="21" x2="4" y2="23" />
          <line x1="26" y1="10" x2="28" y2="8" />
          <line x1="27" y1="16" x2="30" y2="16" />
          <line x1="26" y1="21" x2="28" y2="23" />
        </g>

        {/* Pull cord */}
        <g
          transform={`translate(0, ${pull})`}
          style={{
            transition: snapping ? "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" : undefined,
          }}
        >
          <line
            x1="16"
            y1="22"
            x2="16"
            y2={CORD_REST_Y}
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={0.6}
          />
          <circle
            cx="16"
            cy={CORD_REST_Y}
            r="2.2"
            fill="currentColor"
            opacity={0.6}
            style={{ cursor: "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </g>
      </svg>
    </div>
  );
}

export default ColorModeToggle;
