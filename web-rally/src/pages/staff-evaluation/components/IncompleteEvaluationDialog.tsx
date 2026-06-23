import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { EvaluationSummary } from "./checkpointEvaluation.types";

interface IncompleteEvaluationDialogProps {
  summary: EvaluationSummary | null;
  onClose: () => void;
}

export function IncompleteEvaluationDialog({ summary, onClose }: IncompleteEvaluationDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="w-5 h-5" />
            Incomplete Evaluations Detected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary && (
            <div className="space-y-3">
              {summary.checkpoint_mismatch ? (
                <div>
                  <p className="text-sm font-semibold mb-2 text-yellow-600">
                    ⚠️ This team is from a different checkpoint
                  </p>
                  <p className="text-sm">
                    This team is from checkpoint <strong>{summary.team_checkpoint}</strong>,
                    but you're evaluating them for checkpoint <strong>{summary.current_checkpoint}</strong> activities.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This allows evaluation of teams from previous checkpoints. Their scores will be based on the activities shown.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    This team has <strong>{summary.pending_activities}</strong> unevaluated
                    {summary.pending_activities === 1 ? ' activity' : ' activities'} out of{' '}
                    <strong>{summary.total_activities}</strong> total activities.
                  </p>
                  {summary.missing_activities && summary.missing_activities.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-1">Missing activities:</p>
                      <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
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
        <div className="p-6 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
