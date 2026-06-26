import { MapPin } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { EmptyState } from '@/components/shared';

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
}>

export default function CheckpointList({
  checkpoints,
  selectedCheckpoint,
  onSelectCheckpoint,
  showMap = true
}: CheckpointListProps) {
  return (
    <div className="rally-surface rally-elevate p-5">
      <h3 className="rally-display mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
        <MapPin className="rally-accent h-5 w-5" />
        Lista de postos ({checkpoints.length})
      </h3>

      {checkpoints.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8 text-muted-foreground" />}
          title="Nenhum posto disponível"
          description="Os postos ainda não foram configurados"
        />
      ) : (
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
        </div>
      )}
    </div>
  );
}









