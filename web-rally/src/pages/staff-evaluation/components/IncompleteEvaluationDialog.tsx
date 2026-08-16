import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { EvaluationSummary } from "./checkpointEvaluation.types";

interface IncompleteEvaluationDialogProps {
  summary: EvaluationSummary | null;
  onClose: () => void;
}

export function IncompleteEvaluationDialog({
  summary,
  onClose,
}: Readonly<IncompleteEvaluationDialogProps>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-5 w-5" />
            Avaliações incompletas detetadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary && (
            <div className="space-y-3">
              {summary.checkpoint_mismatch ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                    ⚠️ Esta equipa é de um posto diferente
                  </p>
                  <p className="text-sm">
                    Esta equipa é do posto <strong>{summary.team_checkpoint}</strong>, mas está a
                    avaliá-la para as atividades do posto{" "}
                    <strong>{summary.current_checkpoint}</strong>.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Isto permite avaliar equipas de postos anteriores. As pontuações serão baseadas
                    nas atividades apresentadas.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    Esta equipa tem <strong>{summary.pending_activities}</strong>
                    {summary.pending_activities === 1 ? " atividade" : " atividades"} por avaliar de
                    um total de <strong>{summary.total_activities}</strong> atividades.
                  </p>
                  {summary.missing_activities && summary.missing_activities.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-semibold">Atividades em falta:</p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {summary.missing_activities.map((activity: string) => (
                          <li key={activity}>{activity}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Deseja continuar mesmo assim? Pode avaliar as atividades em falta mais tarde.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
        <div className="flex justify-end gap-3 p-6">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </Card>
    </div>
  );
}
