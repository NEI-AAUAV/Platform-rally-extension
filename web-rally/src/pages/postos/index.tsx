import { useQuery } from "@tanstack/react-query";
import { CheckPointService, type DetailedCheckPoint } from "@/client";
import { useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";
import { PageHeader, LoadingState } from "@/components/shared";
import { CheckpointList, MapSection } from "./components";
import { useThemedComponents } from "@/components/themes";
import { Navigate } from "react-router-dom";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

export default function Postos() {
  const { Card } = useThemedComponents();
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();

  // Fetch checkpoints (always call hooks before any early returns)
  const { data: checkpoints, isLoading } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return response;
    },
    enabled: !isTeamAuthenticated,
  });

  // Redirect team users to their progress page
  if (isTeamAuthenticated) {
    return <Navigate to="/team-progress" replace />;
  }

  // Sort checkpoints by order property from database
  const sortedCheckpoints: Checkpoint[] = (
    checkpoints
      ?.slice()
      .sort((a: DetailedCheckPoint, b: DetailedCheckPoint) => a.order - b.order)
    || []
  );

  if (isLoading) {
    return <LoadingState message="A carregar postos..." />;
  }


  return (
    <div className="mt-8 space-y-6">
      <PageHeader
        title="Postos"
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
        <Card variant="default" padding="lg" rounded="2xl">
          <div className="text-center text-[rgb(255,255,255,0.7)]">
            <div className="w-8 h-8 mx-auto mb-2 opacity-50">📍</div>
            <p>Os postos ainda não têm coordenadas configuradas.</p>
            <p className="text-sm mt-1">
              Contacte um administrador para adicionar localizações aos postos.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

