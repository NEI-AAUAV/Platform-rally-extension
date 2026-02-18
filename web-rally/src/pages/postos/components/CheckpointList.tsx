import { MapPin } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { EmptyState } from '@/components/shared';
import { useThemedComponents } from '@/components/themes';

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

interface CheckpointListProps {
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (checkpoint: Checkpoint) => void;
  showMap?: boolean;
}

export default function CheckpointList({
  checkpoints,
  selectedCheckpoint,
  onSelectCheckpoint,
  showMap = true
}: CheckpointListProps) {
  const { Card } = useThemedComponents();
  return (
    <Card variant="default" padding="lg" rounded="2xl">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5" />
        Lista de Postos ({checkpoints.length})
      </h3>

      {checkpoints.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8 text-[rgb(255,255,255,0.5)]" />}
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
    </Card>
  );
}









