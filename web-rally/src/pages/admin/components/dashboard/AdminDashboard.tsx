import useRallySettings from "@/hooks/useRallySettings";
import { useCountdown } from "@/pages/home/useCountdown";
import PreparationDashboard from "./PreparationDashboard";
import OperationsDashboard from "./OperationsDashboard";
import PostEventDashboard from "./PostEventDashboard";
import type { AdminTabId } from "@/router/routes";

interface AdminDashboardProps {
  /** Navigate to another admin tab — used by PreparationDashboard's actionable issues. */
  onNavigate: (tabId: AdminTabId) => void;
}

/**
 * Picks the right dashboard for the event's current phase, reusing the same
 * pre/live/post derivation as the rest of the app (useCountdown) — the
 * phase itself is not recomputed here.
 */
export default function AdminDashboard({ onNavigate }: Readonly<AdminDashboardProps>) {
  const { settings } = useRallySettings();
  const { phase } = useCountdown(settings?.rally_start_time, settings?.rally_end_time);

  if (phase === "live") return <OperationsDashboard />;
  if (phase === "post") return <PostEventDashboard />;
  // "pre" and "none" (no dates configured yet) both mean the event hasn't
  // started — preparation/readiness is the more useful view in both cases.
  return <PreparationDashboard onNavigate={onNavigate} />;
}
