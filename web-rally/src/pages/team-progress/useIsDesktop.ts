import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

function matches(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_QUERY).matches
    : false;
}

/** Tailwind's `lg` breakpoint as state, for layouts that render different
 * trees rather than restyling one (mounting both would double every
 * check-in control and query). */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
