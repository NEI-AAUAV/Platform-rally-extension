import React from 'react';
import { MapPin } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { EmptyState } from '@/components/shared';

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
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
  return (
    <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5" />
        Lista de Postos ({checkpoints.length})
      </h3>
      
      {checkpoints.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8 text-[rgb(255,255,255,0.5)]" />}
          title="Nenhum posto de controlo disponível"
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






