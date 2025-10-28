import { useQuery } from "@tanstack/react-query";
import { CheckPointService } from "@/client";
import { useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import { PageHeader, LoadingState } from "@/components/shared";
import { CheckpointList, MapSection } from "./postos/components";

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

export default function Postos() {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const { settings } = useRallySettings();

  // Fetch checkpoints
  const { data: checkpoints, isLoading } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return response;
    },
  });

  // Sort checkpoints by order property from database
  const sortedCheckpoints: Checkpoint[] = (
    checkpoints
      ?.slice() // make a shallow copy to avoid mutating original
      .sort((a, b) => a.order - b.order)
    || []
  );

  if (isLoading) {
    return <LoadingState message="A carregar postos..." />;
  }

  return (
    <div className="mt-8 space-y-6">
      <PageHeader 
        title="Postos de Controlo"
        description="Consulte a lista de checkpoints e visualize-os no mapa"
      />

      <CheckpointList
        checkpoints={sortedCheckpoints}
        selectedCheckpoint={selectedCheckpoint}
        onSelectCheckpoint={setSelectedCheckpoint}
        showMap={settings?.show_checkpoint_map !== false}
      />

      <MapSection
        checkpoints={sortedCheckpoints}
        selectedCheckpoint={selectedCheckpoint}
        showMap={settings?.show_checkpoint_map !== false}
      />

      {/* No Coordinates Warning */}
      {!sortedCheckpoints.some((cp: Checkpoint) => cp.latitude && cp.longitude) && sortedCheckpoints.length > 0 && (
        <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
          <div className="text-center text-[rgb(255,255,255,0.7)]">
            <div className="w-8 h-8 mx-auto mb-2 opacity-50">📍</div>
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


