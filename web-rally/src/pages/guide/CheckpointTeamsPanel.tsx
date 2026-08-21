import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, UserCheck, Users } from "lucide-react";
import {
  getGuideTeam,
  getTeams,
  listGuideTeamsAtCheckpoint,
  recordGuideArrival,
  type GuideTeamAtCheckpoint,
  type ListingTeam,
} from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import useRallySettings from "@/hooks/useRallySettings";
import { useUserStore } from "@/stores/useUserStore";
import { getErrorMessage } from "@/utils/errorHandling";

const PRIVILEGED_SCOPES = ["admin", "manager-rally", "rally:admin", "rally-staff"];

type Props = Readonly<{
  checkpointId: number;
  /** Reports every indication any team here has unlocked, so the indication
   *  list can flag the ones already paid for. */
  onPurchasedIdsChange?: (ids: readonly number[]) => void;
}>;

function arrivalTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Who is at this post, and the button for when GPS check-in fails.
 *
 * A guide standing at the post is better proof than a phone with no signal, a
 * flat battery, or a fix that will not settle indoors — so they can vouch for
 * an arrival directly. The list doubles as the record of who turned up and in
 * what order.
 */
export default function CheckpointTeamsPanel({ checkpointId, onPurchasedIdsChange }: Props) {
  const qc = useQueryClient();
  const { settings } = useRallySettings();
  const scopes = useUserStore((state) => state.scopes);
  // Admin/staff/manager run the whole event and never have a guide
  // assignment of their own — they may vouch for any team. A plain guide
  // accompanies a single team and may only vouch for that one, enforced
  // server-side as well.
  const isPrivileged = scopes !== undefined && PRIVILEGED_SCOPES.some((s) => scopes.includes(s));
  const canMarkArrivals = settings?.guide_manual_arrival_enabled !== false;
  const teamsKey = ["guide-teams-at-checkpoint", checkpointId];
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const { data: arrived = [], isLoading } = useQuery<GuideTeamAtCheckpoint[]>({
    queryKey: teamsKey,
    queryFn: async () =>
      (await listGuideTeamsAtCheckpoint({ path: { checkpoint_id: checkpointId } })).data,
    refetchInterval: 30_000,
  });

  const { data: myTeam } = useQuery({
    queryKey: ["guide-team"],
    queryFn: async () => (await getGuideTeam()).data,
    staleTime: 60_000,
    retry: false,
    enabled: !isPrivileged,
  });

  const { data: allTeams = [] } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
    staleTime: 60_000,
    enabled: isPrivileged,
  });

  const markArrived = useMutation({
    mutationFn: async (teamId: number) =>
      (
        await recordGuideArrival({
          path: { checkpoint_id: checkpointId },
          body: { team_id: teamId },
        })
      ).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsKey });
      // The arrival can complete the post outright, which moves the team on.
      void qc.invalidateQueries({ queryKey: ["team"] });
      // Marking the current post's team can advance which post is "current"
      // (see GuideService.current_checkpoint_id) — refetch so the highlight
      // and writable panel move to the next post.
      void qc.invalidateQueries({ queryKey: ["guide-checkpoints"] });
    },
  });

  const purchasedIds = arrived.flatMap((row) => row.revealed_indication_ids);
  useEffect(() => {
    onPurchasedIdsChange?.(purchasedIds);
    // Compared by value: the array identity changes on every refetch, and the
    // ids themselves rarely do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchasedIds.join(","), onPurchasedIdsChange]);

  const arrivedIds = new Set(arrived.map((row) => row.team_id));
  const myTeamAlreadyArrived = myTeam ? arrivedIds.has(myTeam.id) : false;
  const pendingTeams = allTeams.filter((team) => !arrivedIds.has(team.id));

  return (
    <section className="space-y-3">
      <p className="rally-accent flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
        <Users className="h-3.5 w-3.5" /> Equipas neste posto
        {arrived.length > 0 && (
          <span className="font-normal text-muted-foreground">({arrived.length})</span>
        )}
      </p>

      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      {!isLoading && arrived.length === 0 && (
        <p className="text-sm text-muted-foreground">Ainda não chegou nenhuma equipa.</p>
      )}

      {arrived.length > 0 && (
        <ul className="space-y-1.5">
          {arrived.map((row) => (
            <li
              key={row.team_id}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1 truncate font-medium">{row.team_name}</span>
              {row.revealed_indication_ids.length > 0 && (
                // The team paid points for these in the app; reading them out
                // again would be giving away, for free, what they just bought.
                <span className="shrink-0 text-xs text-amber-600">
                  {row.revealed_indication_ids.length} pista
                  {row.revealed_indication_ids.length === 1 ? "" : "s"} já comprada
                  {row.revealed_indication_ids.length === 1 ? "" : "s"}
                </span>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {arrivalTime(row.arrived_at)}
                {row.arrived_by_guide && " · manual"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!canMarkArrivals && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          As chegadas marcadas por guias estão desligadas nas definições do evento.
        </p>
      )}

      {canMarkArrivals && isPrivileged && (
        <>
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor={`arrival-team-${checkpointId}`}>
              Equipa a marcar como chegada
            </label>
            <select
              id={`arrival-team-${checkpointId}`}
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
              className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
            >
              <option value="">Marcar chegada de…</option>
              {pendingTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <BloodyButton
              type="button"
              variant="neutral"
              disabled={!selectedTeamId || markArrived.isPending}
              onClick={() => markArrived.mutate(Number(selectedTeamId))}
            >
              {markArrived.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span className="ml-1.5">Marcar chegada</span>
            </BloodyButton>
          </div>

          <p className="text-xs text-muted-foreground">
            Usa isto quando o check-in por GPS falhar — sem bateria, sem rede, ou dentro de um
            edifício.
          </p>

          {markArrived.isError && (
            <p className="text-xs text-red-500">
              {getErrorMessage(markArrived.error, "Não foi possível marcar a chegada.")}
            </p>
          )}
        </>
      )}

      {canMarkArrivals && !isPrivileged && myTeam && !myTeamAlreadyArrived && (
        <>
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <BloodyButton
              type="button"
              variant="neutral"
              disabled={markArrived.isPending}
              onClick={() => markArrived.mutate(myTeam.id)}
            >
              {markArrived.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span className="ml-1.5">Marcar chegada de {myTeam.name}</span>
            </BloodyButton>
          </div>

          <p className="text-xs text-muted-foreground">
            Usa isto quando o check-in por GPS falhar — sem bateria, sem rede, ou dentro de um
            edifício. Ficas tu como prova de que a equipa esteve aqui.
          </p>

          {markArrived.isError && (
            <p className="text-xs text-red-500">
              {getErrorMessage(markArrived.error, "Não foi possível marcar a chegada.")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
