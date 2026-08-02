import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Press-and-drag scrubbing across the tab bar, as on iOS 26: the selection
 * tracks the finger 1:1 instead of jumping, tabs light up as it passes over
 * them, the pill stretches with the movement and settles back, and navigation
 * only happens on release so the screen never changes mid-drag.
 *
 * The pill is written to imperatively — a drag would otherwise re-render the
 * whole bar on every pointer move.
 */

/** Past this, the gesture is a drag and the underlying link must not fire. */
const DRAG_THRESHOLD_PX = 6;
/**
 * A mostly-vertical movement is not a scrub. The bar sits on the bottom edge,
 * which on Android is also where the system gesture navigation lives, so the
 * gesture has to let go rather than fight it — or block page scrolling that
 * happens to start on the bar.
 */
const VERTICAL_BAILOUT_PX = 10;
/** Speed (px/ms) at which the pill reaches its maximum stretch. */
const STRETCH_SPEED_CAP = 2.2;
const MAX_STRETCH = 0.34;
const SNAP_TRANSITION = "transform 420ms cubic-bezier(0.34, 1.32, 0.5, 1), width 260ms ease";

interface TabScrubOptions {
  readonly count: number;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
}

interface TabScrubResult {
  readonly listRef: React.RefObject<HTMLUListElement>;
  readonly pillRef: React.RefObject<HTMLSpanElement>;
  /** Tab currently under the finger, or -1 when not dragging. */
  readonly hoverIndex: number;
  readonly isDragging: boolean;
  readonly onPointerDown: (event: React.PointerEvent) => void;
  /** Swallows the click that follows a drag, so the link does not also fire. */
  readonly onClickCapture: (event: React.MouseEvent) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useTabScrub({ count, activeIndex, onSelect }: TabScrubOptions): TabScrubResult {
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);

  const gesture = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastAt: 0,
    moved: false,
    index: -1,
  });

  /** Park the pill on a tab with the spring settle. */
  const settle = useCallback(
    (index: number) => {
      const pill = pillRef.current;
      const list = listRef.current;
      if (pill === null || list === null || count === 0) return;
      const slot = list.clientWidth / count;
      pill.style.transition = SNAP_TRANSITION;
      pill.style.transform = `translateX(${clamp(index, 0, count - 1) * slot}px) scale(1, 1)`;
    },
    [count],
  );

  // Keep the pill on the active tab when the route or the tab set changes.
  useEffect(() => {
    if (isDragging) return;
    settle(Math.max(activeIndex, 0));
  }, [activeIndex, isDragging, settle, count]);

  useEffect(() => {
    if (!isDragging) return;

    const move = (event: PointerEvent) => {
      const list = listRef.current;
      const pill = pillRef.current;
      if (list === null || pill === null || count === 0) return;

      const bounds = list.getBoundingClientRect();
      const slot = bounds.width / count;
      const x = clamp(event.clientX - bounds.left, 0, bounds.width);

      const state = gesture.current;
      const travelX = Math.abs(event.clientX - state.startX);
      const travelY = Math.abs(event.clientY - state.startY);

      // Vertical intent before any horizontal intent: hand the gesture back to
      // the browser and the system.
      if (!state.moved && travelY > VERTICAL_BAILOUT_PX && travelY > travelX) {
        state.index = -1;
        setIsDragging(false);
        setHoverIndex(-1);
        settle(Math.max(activeIndex, 0));
        return;
      }

      if (travelX > DRAG_THRESHOLD_PX) state.moved = true;

      const now = event.timeStamp;
      const elapsed = Math.max(now - state.lastAt, 1);
      const speed = Math.abs(event.clientX - state.lastX) / elapsed;
      state.lastX = event.clientX;
      state.lastAt = now;

      // Stretch along the direction of travel, thinning slightly as it goes,
      // which is what makes the material read as liquid rather than rigid.
      const stretch = (Math.min(speed, STRETCH_SPEED_CAP) / STRETCH_SPEED_CAP) * MAX_STRETCH;

      const index = clamp(Math.floor(x / slot), 0, count - 1);
      if (index !== state.index) {
        state.index = index;
        setHoverIndex(index);
        // Haptic tick at each boundary. Android honours it; iOS Safari has no
        // vibration API and simply ignores the call.
        navigator.vibrate?.(8);
      }

      pill.style.transition = "none";
      pill.style.transform = `translateX(${clamp(x - slot / 2, 0, bounds.width - slot)}px) scale(${1 + stretch}, ${1 - stretch * 0.35})`;
    };

    const end = () => {
      const state = gesture.current;
      const index = state.index;
      setIsDragging(false);
      setHoverIndex(-1);
      if (index >= 0) {
        settle(index);
        if (state.moved && index !== activeIndex) onSelect(index);
      }
    };

    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", end);
    globalThis.addEventListener("pointercancel", end);
    return () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", end);
      globalThis.removeEventListener("pointercancel", end);
    };
  }, [isDragging, count, activeIndex, onSelect, settle]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const list = listRef.current;
      if (list === null || count === 0) return;

      const bounds = list.getBoundingClientRect();
      const slot = bounds.width / count;
      const index = clamp(Math.floor((event.clientX - bounds.left) / slot), 0, count - 1);

      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastAt: event.timeStamp,
        moved: false,
        index,
      };
      setHoverIndex(index);
      setIsDragging(true);
    },
    [count],
  );

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!gesture.current.moved) return;
    // The drag already decided where to go.
    event.preventDefault();
    event.stopPropagation();
    gesture.current.moved = false;
  }, []);

  return { listRef, pillRef, hoverIndex, isDragging, onPointerDown, onClickCapture };
}

export default useTabScrub;
