import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRight } from "lucide-react";
import type { DetailedCheckPoint, ActivityResponse, ListingTeam } from "@/client";

type AssignedCheckpointsProps = Readonly<{

  checkpoints: DetailedCheckPoint[];
  activities: ActivityResponse[];
  teams: ListingTeam[];
  onCheckpointClick: (checkpoint: DetailedCheckPoint) => void;
}>

export default function AssignedCheckpoints({ 
  checkpoints, 
  activities, 
  teams, 
  onCheckpointClick 
}: AssignedCheckpointsProps) {
  const CARD = "rally-surface rounded-2xl";
  const ITEM_BASE = "border border-border bg-secondary rounded-xl p-3 sm:p-4 cursor-pointer transition-colors hover:bg-accent w-full text-left";

  if (!checkpoints || checkpoints.length === 0) {
    return (
      <div className={CARD}>
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Postos Atribuídos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Nenhum posto encontrado.
          </p>
        </CardContent>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5" />
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-lg sm:text-base truncate">{checkpoint.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {checkpointActivities.length} atividades • {teamsAtCheckpoint.length} equipas
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <Badge variant="outline" className="text-foreground border-border text-xs sm:text-sm">
                      Posto {checkpoint.order}
                    </Badge>
                    <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
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
