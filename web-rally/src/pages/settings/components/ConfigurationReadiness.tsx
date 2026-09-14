import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { type ConfigurationIssueResponse } from "@/client";
import { useEventConfiguration } from "./useEventConfiguration";

const POLICY_LABEL: Record<string, string> = {
  required: "Obrigatório",
  optional: "Opcional",
  forbidden: "Indisponível",
};
const CAPABILITY_LABEL: Record<string, string> = {
  participant_view: "Vista de participante",
  checkpoint_redaction: "Redação de postos",
  gps_arrival: "Check-in GPS",
  qr_arrival: "Check-in QR",
  guide_arrival: "Chegada por guia",
  staff_scoring: "Avaliação por staff",
  guide_mode: "Modo guia",
  olympic_rotation: "Rotação olímpica",
};

function Issue({ issue }: Readonly<{ issue: ConfigurationIssueResponse }>) {
  let Icon = Info;
  let tone = "text-muted-foreground";

  if (issue.severity === "error") {
    Icon = XCircle;
    tone = "text-destructive";
  } else if (issue.severity === "warning") {
    Icon = AlertTriangle;
    tone = "text-amber-600";
  }
  return (
    <li className="flex gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <span>
        <span className="font-medium">{issue.message}</span>
        {issue.suggestion && (
          <span className="block text-xs text-muted-foreground">{issue.suggestion}</span>
        )}
      </span>
    </li>
  );
}

/** Admin-only summary. It deliberately reads the event-scoped preflight instead of guessing from switches. */
export default function ConfigurationReadiness() {
  const query = useEventConfiguration();

  if (query.isLoading || !query.data) return null;
  const { ready, issues, capabilities } = query.data;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const errorCountLabel = `${errors} erro${errors === 1 ? "" : "s"}`;
  const warningCountLabel = warnings ? ` · ${warnings} aviso${warnings === 1 ? "" : "s"}` : "";
  const readinessDescription = ready
    ? "O formato e os dados necessários para o percurso estão coerentes."
    : errorCountLabel + warningCountLabel;
  const important = Object.entries(capabilities).filter(
    ([, capability]) => capability.policy !== "optional",
  );

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      aria-label="Estado da configuração"
    >
      <div className="flex items-start gap-3">
        {ready ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            {ready ? "Configuração pronta" : "Configuração incompleta"}
          </h2>
          <p className="text-sm text-muted-foreground">{readinessDescription}</p>
        </div>
      </div>
      {important.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {important.map(([name, capability]) => (
            <span
              key={name}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {CAPABILITY_LABEL[name] ?? name.replace(/_/g, " ")} ·{" "}
              {POLICY_LABEL[capability.policy] ?? capability.policy}
            </span>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-border pt-3">
          {issues.map((issue) => (
            <Issue key={`${issue.code}-${issue.entity_ids?.join("-") ?? "event"}`} issue={issue} />
          ))}
        </ul>
      )}
    </section>
  );
}
