import { useQuery } from "@tanstack/react-query";
import { CheckPointService, type DetailedCheckPoint } from "@/client";
import { useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";
import { LoadingState } from "@/components/shared";
import { MapPin } from "lucide-react";
import { CheckpointList, MapSection } from "./components";
import { Navigate } from "@tanstack/react-router";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

import { useUserStore } from "@/stores/useUserStore";

export default function Postos() {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const { scopes } = useUserStore((state) => state);

  // Check if user has admin/manager/staff privileges
  const isPrivileged = scopes !== undefined &&
    (scopes.includes("admin") ||
      scopes.includes("manager-rally") ||
      scopes.includes("rally:admin") ||
      scopes.includes("rally-staff"));

  // Fetch checkpoints (always call hooks before any early returns)
  const { data: checkpoints, isLoading } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return response;
    },
    enabled: !isTeamAuthenticated || isPrivileged,
  });

  // Redirect team users to their progress page ONLY if they are not privileged
  if (isTeamAuthenticated && !isPrivileged) {
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
    <div className="space-y-8">
      <header>
        <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
          <MapPin className="h-3.5 w-3.5" /> O percurso
        </p>
        <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
          Postos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Consulta a lista de postos e localiza-os no mapa.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start">
        <CheckpointList
          checkpoints={sortedCheckpoints}
          selectedCheckpoint={selectedCheckpoint}
          onSelectCheckpoint={setSelectedCheckpoint}
          showMap={settings?.show_checkpoint_map !== false}
        />

        <div className="lg:sticky lg:top-24">
          <MapSection
            checkpoints={sortedCheckpoints}
            selectedCheckpoint={selectedCheckpoint}
            showMap={settings?.show_checkpoint_map !== false}
            onSelectCheckpoint={setSelectedCheckpoint}
          />
        </div>
      </div>
    </div>
  );
}

