import { CheckCircle2, XCircle } from "lucide-react";
import { type ConfigurationIssueResponse } from "@/client";

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

interface EventReadinessSummaryProps {
  ready: boolean;
  issues: readonly ConfigurationIssueResponse[];
  capabilities: Record<string, { policy: string }>;
  /** Show the "important capabilities" badge row (Settings wants it, Dashboard keeps it minimal). */
  showCapabilities?: boolean;
  /**
   * When ready with warnings, mention the warning count instead of the
   * static "coerente" copy. Off by default to keep Settings' existing exact
   * wording; Dashboard turns it on for the "Pronto para começar · N avisos" framing.
   */
  mentionWarningsWhenReady?: boolean;
}

/** Ready/not-ready header, error+warning counts, and (optionally) capability badges. */
export default function EventReadinessSummary({
  ready,
  issues,
  capabilities,
  showCapabilities = true,
  mentionWarningsWhenReady = false,
}: Readonly<EventReadinessSummaryProps>) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const errorCountLabel = `${errors} erro${errors === 1 ? "" : "s"}`;
  const warningCountLabel = warnings ? ` · ${warnings} aviso${warnings === 1 ? "" : "s"}` : "";
  const readinessDescription = ready
    ? mentionWarningsWhenReady && warnings > 0
      ? `Pronto para começar · ${warnings} aviso${warnings === 1 ? "" : "s"}`
      : "O formato e os dados necessários para o percurso estão coerentes."
    : errorCountLabel + warningCountLabel;
  const important = Object.entries(capabilities).filter(
    ([, capability]) => capability.policy !== "optional",
  );

  return (
    <div>
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
      {showCapabilities && important.length > 0 && (
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
    </div>
  );
}
