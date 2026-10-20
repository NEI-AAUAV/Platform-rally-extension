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
  if (!checkpoints || checkpoints.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="rally-display text-4xl text-foreground">Postos Atribuídos</h2>
        <div className="rally-surface flex flex-col items-center gap-2 p-8 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum posto encontrado.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="rally-display text-4xl text-foreground">Postos Atribuídos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {checkpoints.map((checkpoint) => {
          const checkpointActivities = activities.filter(
            (activity) => activity.checkpoint_id === checkpoint.id,
          );

          return (
            <button
              key={checkpoint.id}
              type="button"
              className="rally-surface rally-press group flex items-center gap-4 p-5 text-left transition-colors hover:bg-accent"
              onClick={() => onCheckpointClick(checkpoint)}
            >
              <span className="rally-display rally-accent w-12 shrink-0 text-5xl leading-none">
                {checkpoint.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="rally-display block truncate text-2xl text-foreground">
                  {checkpoint.name}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {checkpointActivities.length} atividades • {teams.length} equipas
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export { AssignedCheckpoints };
