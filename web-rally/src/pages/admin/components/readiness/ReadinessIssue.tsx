import { AlertTriangle, Info, XCircle } from "lucide-react";
import { type ConfigurationIssueResponse } from "@/client";
import { navigationIntentForIssue, type ReadinessNavigationIntent } from "./readinessNavigation";

interface ReadinessIssueProps {
  issue: ConfigurationIssueResponse;
  /** When provided, renders a "Corrigir →" link that navigates to the issue's
   * admin destination, carrying the affected entities/field along. */
  onNavigate?: (intent: ReadinessNavigationIntent) => void;
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

  const intent = onNavigate ? navigationIntentForIssue(issue) : undefined;
  const affected = intent?.highlightIds?.length ?? 0;

  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{issue.message}</span>
        {issue.suggestion && (
          <span className="block text-xs text-muted-foreground">{issue.suggestion}</span>
        )}
      </span>
      {intent && onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(intent)}
          aria-label={
            affected > 0
              ? `Corrigir: mostrar ${affected} ${affected === 1 ? "item afetado" : "itens afetados"}`
              : undefined
          }
          className="shrink-0 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
        >
          Corrigir →
        </button>
      )}
    </li>
  );
}
