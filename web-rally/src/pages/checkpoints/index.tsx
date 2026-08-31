import { useQuery } from "@tanstack/react-query";
import { getCheckpoints, type DetailedCheckPoint } from "@/client";
import { useState } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useTeamAuth from "@/hooks/useTeamAuth";
import { LoadingState } from "@/components/shared";
import { MapPin } from "lucide-react";
import { CheckpointList, MapSection } from "./components";
import { Navigate } from "@tanstack/react-router";

import { useUserStore } from "@/stores/useUserStore";

export default function Postos() {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<DetailedCheckPoint | null>(null);
  const { settings } = useRallySettings();
  const terms = useEventTerms();
  const checkpointsLabel = capitalize(terms.checkpoints);
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const { scopes } = useUserStore((state) => state);

  // Check if user has admin/manager/staff privileges
  const isPrivileged =
    scopes !== undefined &&
    (scopes.includes("admin") ||
      scopes.includes("manager-rally") ||
      scopes.includes("rally-staff") ||
      scopes.includes("rally-guide"));

  const canViewPostos = isPrivileged || settings?.show_checkpoint_map === true;

  // Fetch checkpoints (always call hooks before any early returns)
  const { data: checkpoints, isLoading } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data;
    },
    enabled: !isTeamAuthenticated || canViewPostos,
  });

  // Redirect team users to their progress page unless admin allows the checkpoint map for teams
  if (isTeamAuthenticated && !canViewPostos) {
    return <Navigate to="/team-progress" replace />;
  }

  // Sort checkpoints by order property from database
  const sortedCheckpoints: DetailedCheckPoint[] =
    checkpoints
      ?.slice()
      .sort((a: DetailedCheckPoint, b: DetailedCheckPoint) => a.order - b.order) || [];

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
          {checkpointsLabel}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Consulta a lista de {terms.checkpoints} e encontra no mapa.
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
