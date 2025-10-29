import { Navigation, MapPin } from 'lucide-react';
import { useThemedComponents } from '@/components/themes';

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

interface MapSectionProps {
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  showMap?: boolean;
}

// Helper function to validate checkpoint coordinates
function hasValidCoordinates(checkpoint: Checkpoint): boolean {
  return checkpoint.latitude !== null && 
         checkpoint.latitude !== undefined && 
         checkpoint.longitude !== null && 
         checkpoint.longitude !== undefined;
}

// Helper function to filter valid coordinates
function getValidCoordinate(checkpoint: Checkpoint, coordType: 'latitude' | 'longitude'): number | null {
  const coord = checkpoint[coordType];
  return (coord !== null && coord !== undefined) ? coord : null;
}

export default function MapSection({ checkpoints, selectedCheckpoint, showMap = true }: MapSectionProps) {
  const { Card } = useThemedComponents();
  // Calculate map bounds if we have coordinates
  const hasCoordinates = checkpoints.some(hasValidCoordinates);
  
  const mapBounds = hasCoordinates ? {
    minLat: checkpoints
      .map(cp => getValidCoordinate(cp, 'latitude'))
      .filter(coord => coord !== null)
      .reduce((min, coord) => coord !== null && coord < min ? coord : min, Infinity),
    maxLat: checkpoints
      .map(cp => getValidCoordinate(cp, 'latitude'))
      .filter(coord => coord !== null)
      .reduce((max, coord) => coord !== null && coord > max ? coord : max, -Infinity),
    minLng: checkpoints
      .map(cp => getValidCoordinate(cp, 'longitude'))
      .filter(coord => coord !== null)
      .reduce((min, coord) => coord !== null && coord < min ? coord : min, Infinity),
    maxLng: checkpoints
      .map(cp => getValidCoordinate(cp, 'longitude'))
      .filter(coord => coord !== null)
      .reduce((max, coord) => coord !== null && coord > max ? coord : max, -Infinity),
  } : null;

  // Generate Google Maps URL with waypoints for route
  const generateMapUrl = () => {
    if (!hasCoordinates || !mapBounds) return null;
    
    const validCheckpoints = checkpoints.filter(hasValidCoordinates);
    
    // Create waypoints for Google Maps directions
    const waypoints = validCheckpoints
      .map((cp) => `${cp.latitude},${cp.longitude}`)
      .join('|');
    
    // Use directions API with waypoints to create a route
    return `https://www.google.com/maps/dir/?api=1&waypoints=${waypoints}`;
  };

  const mapUrl = generateMapUrl();

  if (!showMap || !hasCoordinates) {
    return null;
  }

  return (
    <Card variant="default" padding="lg" rounded="2xl">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Navigation className="w-5 h-5" />
        Mapa dos Postos
      </h3>
      
      <div className="space-y-4">
        <p className="text-[rgb(255,255,255,0.7)] text-sm">
          Clique no botão abaixo para abrir o mapa com todos os postos de controlo:
        </p>
        
        <div className="flex gap-3">
          <a
            href={mapUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
          >
            <Navigation className="w-4 h-4" />
            Abrir Mapa Completo
          </a>
          
          {selectedCheckpoint?.latitude && selectedCheckpoint?.longitude && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCheckpoint.latitude},${selectedCheckpoint.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[rgb(255,255,255,0.1)] hover:bg-[rgb(255,255,255,0.2)] rounded-lg text-white font-medium transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Ver Posto Selecionado
            </a>
          )}
        </div>
        
        <div className="text-xs text-[rgb(255,255,255,0.5)]">
          💡 Dica: Os postos estão numerados pela ordem de visitação. 
          {selectedCheckpoint && ` Posto selecionado: ${selectedCheckpoint.name} (Ordem ${selectedCheckpoint.order})`}
        </div>
      </div>
    </Card>
  );
}

