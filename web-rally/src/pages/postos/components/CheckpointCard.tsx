import { MapPin, Navigation } from 'lucide-react';
import { useThemedComponents } from '@/components/themes';

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  isSelected: boolean;
  onSelect: (checkpoint: Checkpoint) => void;
  showMap?: boolean;
}

export default function CheckpointCard({ 
  checkpoint, 
  isSelected, 
  onSelect, 
  showMap = true 
}: CheckpointCardProps) {
  const { InteractiveCard } = useThemedComponents();
  const hasCoordinates = checkpoint.latitude && checkpoint.longitude;

  return (
    <InteractiveCard
      status={isSelected ? "info" : "default"}
      selected={isSelected}
      onClick={() => onSelect(checkpoint)}
      aria-pressed={isSelected}
      aria-label={`Selecionar checkpoint ${checkpoint.name}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-8 h-8 bg-[rgb(255,255,255,0.1)] rounded-full text-sm font-bold">
              {checkpoint.order}
            </div>
            <div>
              <h4 className="font-semibold text-lg">{checkpoint.name}</h4>
              <p className="text-sm text-[rgb(255,255,255,0.7)]">
                {checkpoint.description}
              </p>
            </div>
          </div>
          
          {showMap && hasCoordinates && (
            <div className="flex items-center gap-2 text-sm text-[rgb(255,255,255,0.6)]">
              <MapPin className="w-4 h-4" />
              <span>
                {checkpoint.latitude?.toFixed(6) ?? 'N/A'}, {checkpoint.longitude?.toFixed(6) ?? 'N/A'}
              </span>
            </div>
          )}
        </div>
        
        {showMap && hasCoordinates && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-[rgb(255,255,255,0.1)] rounded-lg text-sm hover:bg-[rgb(255,255,255,0.2)] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Navigation className="w-4 h-4" />
            Ver no Mapa
          </a>
        )}
      </div>
    </InteractiveCard>
  );
}
