import { useEffect, useRef } from "react";

interface TypewriterProps {
  readonly text: string;
  readonly delay?: number;
  readonly className?: string;
}

/**
 * Types `text` out one character at a time after an optional delay. Pure DOM
 * mutation on a single span — cheap, no library. Respects reduced-motion by
 * rendering the full text immediately.
 */
export function Typewriter({ text, delay = 0, className }: TypewriterProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.textContent = text;
      return;
    }

    el.textContent = "";
    const chars = [...text];
    let i = 0;
    let interval: ReturnType<typeof setInterval>;

    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        if (i < chars.length) {
          el.textContent += chars[i];
          i += 1;
        } else {
          clearInterval(interval);
        }
      }, 55);
    }, delay);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [text, delay]);

  return <span ref={ref} className={className} aria-label={text} />;
}

export default Typewriter;
