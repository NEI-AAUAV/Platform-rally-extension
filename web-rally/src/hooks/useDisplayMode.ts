import { useEffect, useState } from "react";

export type DisplayMode = "standalone" | "browser";

const STANDALONE_QUERY = "(display-mode: standalone)";

/** iOS below 26 only exposes the legacy navigator.standalone flag. */
interface LegacyStandaloneNavigator {
  standalone?: boolean;
}

function readDisplayMode(): DisplayMode {
  if (globalThis.window === undefined) return "browser";
  if (globalThis.matchMedia?.(STANDALONE_QUERY)?.matches) return "standalone";
  const legacy = navigator as Navigator & LegacyStandaloneNavigator;
  return legacy.standalone === true ? "standalone" : "browser";
}

/**
 * Whether the app is running as an installed/Home Screen web app.
 *
 * This matters more since iOS 26: Safari dropped every installability
 * requirement, so any site added to the Home Screen launches standalone
 * whether or not it opted in. Standalone launches have no URL bar and no
 * browser back button, so navigation has to be self-sufficient.
 */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>(readDisplayMode);

  useEffect(() => {
    const mql = globalThis.matchMedia?.(STANDALONE_QUERY);
    if (!mql) return;
    const onChange = () => setMode(readDisplayMode());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return mode;
}

export default useDisplayMode;
