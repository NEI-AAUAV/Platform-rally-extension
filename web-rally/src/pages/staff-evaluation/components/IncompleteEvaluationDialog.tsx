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
            Incomplete Evaluations Detected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary && (
            <div className="space-y-3">
              {summary.checkpoint_mismatch ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                    ⚠️ This team is from a different checkpoint
                  </p>
                  <p className="text-sm">
                    This team is from checkpoint <strong>{summary.team_checkpoint}</strong>, but
                    you're evaluating them for checkpoint{" "}
                    <strong>{summary.current_checkpoint}</strong> activities.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This allows evaluation of teams from previous checkpoints. Their scores will be
                    based on the activities shown.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    This team has <strong>{summary.pending_activities}</strong> unevaluated
                    {summary.pending_activities === 1 ? " activity" : " activities"} out of{" "}
                    <strong>{summary.total_activities}</strong> total activities.
                  </p>
                  {summary.missing_activities && summary.missing_activities.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-semibold">Missing activities:</p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {summary.missing_activities.map((activity: string) => (
                          <li key={activity}>{activity}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Would you like to proceed anyway? You can evaluate the missing activities later.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
        <div className="flex justify-end gap-3 p-6">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
