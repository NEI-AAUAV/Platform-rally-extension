import { MapPin } from "lucide-react";
import CheckpointCard from "./CheckpointCard";
import { EmptyState } from "@/components/shared";
import UpcomingCheckpointsCard from "./UpcomingCheckpointsCard";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

type CheckpointListProps = Readonly<{
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (checkpoint: Checkpoint) => void;
  showMap?: boolean;
  /** A focused route is withholding posts the team has not reached yet. */
  hasHiddenCheckpoints?: boolean;
}>;

export default function CheckpointList({
  checkpoints,
  selectedCheckpoint,
  onSelectCheckpoint,
  showMap = true,
  hasHiddenCheckpoints = false,
}: CheckpointListProps) {
  if (checkpoints.length === 0 && !hasHiddenCheckpoints) {
    return (
      <EmptyState
        icon={<MapPin className="h-8 w-8 text-muted-foreground" />}
        title="Nenhum posto disponível"
        description="Os postos ainda não foram configurados"
      />
    );
  }

  return (
    <div className="space-y-3">
      {checkpoints.map((checkpoint) => (
        <CheckpointCard
          key={checkpoint.id}
          checkpoint={checkpoint}
          isSelected={selectedCheckpoint?.id === checkpoint.id}
          onSelect={onSelectCheckpoint}
          showMap={showMap}
        />
      ))}
      {hasHiddenCheckpoints && <UpcomingCheckpointsCard />}
    </div>
  );
}
