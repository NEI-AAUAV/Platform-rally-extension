import { AlertTriangle, Info, XCircle } from "lucide-react";
import { type ConfigurationIssueResponse } from "@/client";
import { targetForIssue } from "./readinessNavigation";
import type { AdminTabId } from "@/router/routes";

interface ReadinessIssueProps {
  issue: ConfigurationIssueResponse;
  /** When provided, renders a "Corrigir →" link that navigates to the issue's admin destination. */
  onNavigate?: (tabId: AdminTabId) => void;
}

/** A single readiness issue row, with an optional actionable "fix it" link. */
export default function ReadinessIssue({ issue, onNavigate }: Readonly<ReadinessIssueProps>) {
  let Icon = Info;
  let tone = "text-muted-foreground";

  if (issue.severity === "error") {
    Icon = XCircle;
    tone = "text-destructive";
  } else if (issue.severity === "warning") {
    Icon = AlertTriangle;
    tone = "text-amber-600";
  }

  const target = onNavigate ? targetForIssue(issue) : undefined;

  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{issue.message}</span>
        {issue.suggestion && (
          <span className="block text-xs text-muted-foreground">{issue.suggestion}</span>
        )}
      </span>
      {target && onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(target.tabId)}
          className="shrink-0 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
        >
          Corrigir →
        </button>
      )}
    </li>
  );
}
