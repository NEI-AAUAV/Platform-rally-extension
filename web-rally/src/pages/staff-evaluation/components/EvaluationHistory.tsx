import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Flag, Pencil } from "lucide-react";
import { getEvaluationHistory, type EvaluationHistoryEntry } from "@/client";

type EvaluationHistoryProps = Readonly<{
  resultId: number;
}>;

const FIELD_LABELS: Record<string, string> = {
  final_score: "Pontuação final",
  points_score: "Pontos",
  time_score: "Tempo",
  boolean_score: "Concluído",
  team_vs_result: "Resultado (VS)",
  extra_shots: "Shots extra",
  result_data: "Dados",
  penalties: "Penalizações",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangeRow({ field, diff }: { field: string; diff: unknown }) {
  const { before, after } =
    diff && typeof diff === "object"
      ? (diff as { before?: unknown; after?: unknown })
      : { before: undefined, after: undefined };
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{FIELD_LABELS[field] ?? field}:</span>
      <span className="text-red-400 line-through">{formatValue(before)}</span>
      <span className="text-muted-foreground">→</span>
      <span className="text-green-400">{formatValue(after)}</span>
    </div>
  );
}

function HistoryEntryCard({ entry }: { entry: EvaluationHistoryEntry }) {
  const isContest = entry.action === "contested";
  const when = new Date(entry.created_at).toLocaleString("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const changes = (entry.changes ?? {}) as Record<string, unknown>;

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {isContest ? (
          <Flag className="h-4 w-4 text-amber-400" />
        ) : (
          <Pencil className="h-4 w-4 text-blue-400" />
        )}
        <span className="text-sm font-medium text-foreground">
          {isContest ? "Contestação" : "Edição"}
        </span>
        <span className="text-xs text-muted-foreground">
          por {entry.editor_name ?? "desconhecido"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{when}</span>
      </div>

      {isContest ? (
        entry.note && <p className="text-xs italic text-foreground">“{entry.note}”</p>
      ) : (
        <div className="space-y-1">
          {Object.entries(changes).map(([field, diff]) => (
            <ChangeRow key={field} field={field} diff={diff} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EvaluationHistory({ resultId }: EvaluationHistoryProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["evaluation-history", resultId],
    queryFn: async () => {
      const { data: rows } = await getEvaluationHistory({
        path: { result_id: resultId },
      });
      return rows ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />A carregar histórico…
      </div>
    );
  }

  if (isError) {
    return <p className="py-3 text-xs text-red-400">Não foi possível carregar o histórico.</p>;
  }

  const entries = data ?? [];
  if (entries.length === 0) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        Sem alterações registadas — avaliação nunca foi editada nem contestada.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <History className="h-4 w-4" />
        Histórico ({entries.length})
      </div>
      {entries.map((entry) => (
        <HistoryEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export { EvaluationHistory };
