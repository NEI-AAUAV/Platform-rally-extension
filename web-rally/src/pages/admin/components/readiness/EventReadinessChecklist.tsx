import { type ConfigurationIssueResponse } from "@/client";
import ReadinessIssue from "./ReadinessIssue";
import type { AdminTabId } from "@/router/routes";

interface EventReadinessChecklistProps {
  issues: readonly ConfigurationIssueResponse[];
  /** When provided, each issue gets a "Corrigir →" link that navigates to its admin destination. */
  onNavigate?: (tabId: AdminTabId) => void;
}

/** The list of readiness issues, each optionally actionable. */
export default function EventReadinessChecklist({
  issues,
  onNavigate,
}: Readonly<EventReadinessChecklistProps>) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-4 space-y-2 border-t border-border pt-3">
      {issues.map((issue) => (
        <ReadinessIssue
          key={`${issue.code}-${issue.entity_ids?.join("-") ?? "event"}`}
          issue={issue}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}
