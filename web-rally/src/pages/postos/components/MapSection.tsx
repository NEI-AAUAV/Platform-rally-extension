import React from 'react';
import { Navigation, MapPin } from 'lucide-react';

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
  order: number;
}

interface MapSectionProps {
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  showMap?: boolean;
}

export default function MapSection({ checkpoints, selectedCheckpoint, showMap = true }: MapSectionProps) {
  // Calculate map bounds if we have coordinates
  const hasCoordinates = checkpoints.some(cp => cp.latitude !== null && cp.latitude !== undefined && cp.longitude !== null && cp.longitude !== undefined);
  
  const mapBounds = hasCoordinates ? {
    minLat: Math.min(...checkpoints.map(cp => cp.latitude).filter(coord => coord !== null && coord !== undefined)),
    maxLat: Math.max(...checkpoints.map(cp => cp.latitude).filter(coord => coord !== null && coord !== undefined)),
    minLng: Math.min(...checkpoints.map(cp => cp.longitude).filter(coord => coord !== null && coord !== undefined)),
    maxLng: Math.max(...checkpoints.map(cp => cp.longitude).filter(coord => coord !== null && coord !== undefined)),
  } : null;

  // Generate Google Maps URL
  const generateMapUrl = () => {
    if (!hasCoordinates || !mapBounds) return null;
    
    const centerLat = (mapBounds.minLat + mapBounds.maxLat) / 2;
    const centerLng = (mapBounds.minLng + mapBounds.maxLng) / 2;
    
    const markers = checkpoints
      .filter(cp => cp.latitude !== null && cp.latitude !== undefined && cp.longitude !== null && cp.longitude !== undefined)
      .map((cp) => `${cp.latitude},${cp.longitude}`)
      .join('|');
    
    return `https://www.google.com/maps?q=${markers}&center=${centerLat},${centerLng}&zoom=12`;
  };

  const mapUrl = generateMapUrl();

  if (!showMap || !hasCoordinates) {
    return null;
  }

  return (
    <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
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
              href={`https://www.google.com/maps?q=${selectedCheckpoint.latitude},${selectedCheckpoint.longitude}`}
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
    </div>
  );
}

