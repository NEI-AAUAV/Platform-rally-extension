import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRight } from "lucide-react";
import type { DetailedCheckPoint, ActivityResponse, ListingTeam } from "@/client";

type AssignedCheckpointsProps = Readonly<{
  checkpoints: DetailedCheckPoint[];
  activities: ActivityResponse[];
  teams: ListingTeam[];
  onCheckpointClick: (checkpoint: DetailedCheckPoint) => void;
}>;

export default function AssignedCheckpoints({
  checkpoints,
  activities,
  teams,
  onCheckpointClick,
}: AssignedCheckpointsProps) {
  const CARD = "rally-surface rounded-2xl";
  const ITEM_BASE =
    "border border-border bg-secondary rounded-xl p-3 sm:p-4 cursor-pointer transition-colors hover:bg-accent w-full text-left";

  if (!checkpoints || checkpoints.length === 0) {
    return (
      <div className={CARD}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MapPin className="h-5 w-5" />
            Postos Atribuídos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-muted-foreground">Nenhum posto encontrado.</p>
        </CardContent>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MapPin className="h-5 w-5" />
          Postos Atribuídos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {checkpoints.map((checkpoint) => {
            const checkpointActivities = activities.filter(
              (activity) => activity.checkpoint_id === checkpoint.id,
            );
            const teamsAtCheckpoint = teams;

            return (
              <button
                key={checkpoint.id}
                type="button"
                className={ITEM_BASE}
                onClick={() => onCheckpointClick(checkpoint)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-foreground sm:text-base">
                      {checkpoint.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {checkpointActivities.length} atividades • {teamsAtCheckpoint.length} equipas
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <Badge
                      variant="outline"
                      className="border-border text-xs text-foreground sm:text-sm"
                    >
                      Posto {checkpoint.order}
                    </Badge>
                    <ArrowRight className="h-5 w-5 flex-shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </div>
  );
}

export { AssignedCheckpoints };
