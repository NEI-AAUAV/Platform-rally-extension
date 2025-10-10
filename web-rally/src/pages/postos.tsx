import { useQuery } from "@tanstack/react-query";
import { CheckPointService } from "@/client";
import { MapPin, Navigation } from "lucide-react";
import { useState } from "react";

export default function Postos() {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<any>(null);

  // Fetch checkpoints
  const { data: checkpoints, isLoading } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return response;
    },
  });

  // Sort checkpoints by order
  const sortedCheckpoints = checkpoints?.sort((a, b) => a.order - b.order) || [];

  // Calculate map bounds if we have coordinates
  const hasCoordinates = sortedCheckpoints.some(cp => cp.latitude && cp.longitude);
  
  const mapBounds = hasCoordinates ? {
    minLat: Math.min(...sortedCheckpoints.map(cp => cp.latitude).filter(Boolean)),
    maxLat: Math.max(...sortedCheckpoints.map(cp => cp.latitude).filter(Boolean)),
    minLng: Math.min(...sortedCheckpoints.map(cp => cp.longitude).filter(Boolean)),
    maxLng: Math.max(...sortedCheckpoints.map(cp => cp.longitude).filter(Boolean)),
  } : null;

  // Generate Google Maps URL
  const generateMapUrl = () => {
    if (!hasCoordinates) return null;
    
    const centerLat = (mapBounds.minLat + mapBounds.maxLat) / 2;
    const centerLng = (mapBounds.minLng + mapBounds.maxLng) / 2;
    
    const markers = sortedCheckpoints
      .filter(cp => cp.latitude && cp.longitude)
      .map((cp, index) => `${cp.latitude},${cp.longitude}`)
      .join('|');
    
    return `https://www.google.com/maps?q=${markers}&center=${centerLat},${centerLng}&zoom=12`;
  };

  const mapUrl = generateMapUrl();

  if (isLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <div className="text-[rgb(255,255,255,0.7)]">A carregar postos...</div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Postos de Controlo</h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Consulte a lista de checkpoints e visualize-os no mapa
        </p>
      </div>

      {/* Checkpoints List */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Lista de Postos ({sortedCheckpoints.length})
        </h3>
        
        {sortedCheckpoints.length === 0 ? (
          <p className="text-[rgb(255,255,255,0.7)] text-center py-8">
            Nenhum posto de controlo disponível.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedCheckpoints.map((checkpoint: any) => (
              <div
                key={checkpoint.id}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedCheckpoint?.id === checkpoint.id
                    ? 'bg-[rgb(255,255,255,0.08)] border-[rgb(255,255,255,0.3)]'
                    : 'bg-[rgb(255,255,255,0.02)] border-[rgb(255,255,255,0.1)] hover:bg-[rgb(255,255,255,0.04)]'
                }`}
                onClick={() => setSelectedCheckpoint(checkpoint)}
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
                    
                    {(checkpoint.latitude || checkpoint.longitude) && (
                      <div className="flex items-center gap-2 text-sm text-[rgb(255,255,255,0.6)]">
                        <MapPin className="w-4 h-4" />
                        <span>
                          {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {(checkpoint.latitude && checkpoint.longitude) && (
                    <a
                      href={`https://www.google.com/maps?q=${checkpoint.latitude},${checkpoint.longitude}`}
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Map Section */}
      {hasCoordinates && (
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
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
              >
                <Navigation className="w-4 h-4" />
                Abrir Mapa Completo
              </a>
              
              {selectedCheckpoint && selectedCheckpoint.latitude && selectedCheckpoint.longitude && (
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
      )}

      {/* No Coordinates Warning */}
      {!hasCoordinates && sortedCheckpoints.length > 0 && (
        <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
          <div className="text-center text-[rgb(255,255,255,0.7)]">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Os postos ainda não têm coordenadas configuradas.</p>
            <p className="text-sm mt-1">
              Contacte um administrador para adicionar localizações aos postos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}






