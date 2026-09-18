import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, MapPin, Users } from "lucide-react";
import { getTeams, getCheckpoints, type ListingTeam } from "@/client";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";
import EventReadinessSummary from "../readiness/EventReadinessSummary";
import EventReadinessChecklist from "../readiness/EventReadinessChecklist";
import type { AdminTabId } from "@/router/routes";

function StatPill({
  icon: Icon,
  value,
  label,
}: Readonly<{ icon: typeof Users; value: number; label: string }>) {
  return (
    <div className="rally-surface flex items-center gap-3 rounded-xl border border-border p-3.5">
      <div className="rounded-lg bg-secondary p-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="rally-display text-xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Shown before the event starts. Answers "está tudo pronto para começar?"
 * by reusing the backend preflight (useEventConfiguration) — no readiness
 * logic is re-derived here, only presented.
 */
interface PreparationDashboardProps {
  /** Navigate to another admin tab — owned by the page, not this component. */
  onNavigate: (tabId: AdminTabId) => void;
}

export default function PreparationDashboard({ onNavigate }: Readonly<PreparationDashboardProps>) {
  const configQuery = useEventConfiguration();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
  });
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => (await getCheckpoints()).data,
  });

  const teamList = useMemo(() => (Array.isArray(teams) ? (teams as ListingTeam[]) : []), [teams]);
  const checkpointList = useMemo(
    () => (Array.isArray(checkpoints) ? checkpoints : []),
    [checkpoints],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="rally-display text-lg font-bold text-foreground">Preparação da prova</h2>
        <p className="text-sm text-muted-foreground">
          O evento ainda não começou — confirme que está tudo pronto antes da partida.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatPill icon={Users} value={teamList.length} label="Equipas" />
        <StatPill icon={MapPin} value={checkpointList.length} label="Postos" />
        <StatPill
          icon={ClipboardList}
          value={configQuery.data?.issues.length ?? 0}
          label="Pontos a verificar"
        />
      </div>

      <div className="rally-surface rounded-xl border border-border p-4">
        {configQuery.isLoading && (
          <p className="text-sm text-muted-foreground">A verificar configuração do evento…</p>
        )}
        {configQuery.isError && (
          <p className="text-sm text-destructive">
            Não foi possível verificar a configuração do evento.
          </p>
        )}
        {configQuery.data && (
          <>
            <EventReadinessSummary
              ready={configQuery.data.ready}
              issues={configQuery.data.issues}
              capabilities={configQuery.data.capabilities}
              showCapabilities={false}
              mentionWarningsWhenReady
            />
            <EventReadinessChecklist issues={configQuery.data.issues} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </div>
  );
}
