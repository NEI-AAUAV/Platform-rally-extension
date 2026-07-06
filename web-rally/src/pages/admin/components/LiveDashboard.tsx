import { lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle, Clock, Flag, Users } from "lucide-react";
import { TeamService, CheckPointService, StaffEvaluationService, type ListingTeam } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import { useCountdown } from "@/pages/home/useCountdown";

const PointsDistributionChart = lazy(
  () => import("@/components/scoreboard/PointsDistributionChart"),
);

const PAD = (n: number) => String(n).padStart(2, "0");
const ACCENT = "var(--rally-accent, #008542)";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PhaseChip({ phase, state }: { phase: string; state: ReturnType<typeof useCountdown> }) {
  if (phase === "live") {
    return (
      <span className="rally-bg-accent inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        A decorrer — termina em {PAD(state.hours)}:{PAD(state.minutes)}:{PAD(state.seconds)}
      </span>
    );
  }
  if (phase === "pre") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-600 dark:text-yellow-300">
        <Clock className="h-3.5 w-3.5" />
        Começa em {state.days > 0 ? `${state.days}d ` : ""}{PAD(state.hours)}:{PAD(state.minutes)}:{PAD(state.seconds)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
      <Flag className="h-3.5 w-3.5" />
      Terminada
    </span>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Users;
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rally-surface flex items-center gap-4 rounded-xl border border-border p-4 shadow-[var(--rally-shadow-sm)]">
      <div className={`rounded-lg p-2 ${accent ? "rally-bg-accent text-white" : "bg-secondary text-muted-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="rally-display text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function LiveDashboard() {
  const { settings } = useRallySettings();
  const countdownState = useCountdown(settings?.rally_start_time, settings?.rally_end_time);

  useScoreboardStream([["teams"]]);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
    refetchInterval: 15_000,
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
  });

  const { data: allEvals } = useQuery<{ evaluations?: unknown[] }>({
    queryKey: ["allEvaluations"],
    queryFn: () => StaffEvaluationService.getAllEvaluationsApiRallyV1StaffAllEvaluationsGet() as Promise<{ evaluations?: unknown[] }>,
    refetchInterval: 15_000,
  });

  const teamList = useMemo(
    () => (Array.isArray(teams) ? (teams as ListingTeam[]) : []),
    [teams],
  );
  const checkpointList = useMemo(
    () => (Array.isArray(checkpoints) ? checkpoints : []),
    [checkpoints],
  );
  const totalEvals = allEvals?.evaluations?.length ?? 0;

  const teamsStarted = teamList.filter((t) => (t.last_checkpoint_number ?? 0) > 0).length;
  const teamsNotStarted = teamList.length - teamsStarted;
  const checkpointsTotal = checkpointList.length;

  const rankedTeams = [...teamList].sort(
    (a, b) => a.classification - b.classification,
  );

  const perCheckpointData = useMemo(() => {
    return checkpointList.map((cp) => {
      const reached = teamList.filter((t) => (t.last_checkpoint_number ?? 0) >= cp.order).length;
      return { name: cp.name.slice(0, 14), reached, total: teamList.length, order: cp.order };
    });
  }, [checkpointList, teamList]);

  return (
    <div className="space-y-6">
      {/* Phase status */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="rally-display text-lg font-bold text-foreground">Estado do evento</h2>
        <PhaseChip phase={countdownState.phase} state={countdownState} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} value={teamList.length} label="Equipas" accent />
        <StatCard icon={Flag} value={checkpointList.length} label="Postos" />
        <StatCard icon={CheckCircle} value={teamsStarted} label="Iniciaram" />
        <StatCard icon={Activity} value={totalEvals} label="Avaliações" />
      </div>

      {/* Teams not started alert */}
      {teamsNotStarted > 0 && countdownState.phase === "live" && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
          <Clock className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
            {teamsNotStarted} equipa{teamsNotStarted !== 1 ? "s" : ""} ainda não iniciou o percurso
          </p>
        </div>
      )}

      {/* Teams per checkpoint chart */}
      {perCheckpointData.length > 0 && (
        <div className="rally-surface rounded-xl border border-border p-5 shadow-[var(--rally-shadow-sm)]">
          <h3 className="rally-display mb-4 text-base font-bold text-foreground">
            Equipas por posto
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, perCheckpointData.length * 36)}>
            <BarChart
              data={perCheckpointData}
              layout="vertical"
              margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                domain={[0, teamList.length || 1]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip
                formatter={(val: unknown) => [`${val} equipas`, "Chegaram"]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="reached" radius={[0, 4, 4, 0]}>
                {perCheckpointData.map((entry) => (
                  <Cell
                    key={entry.order}
                    fill={ACCENT}
                    fillOpacity={0.2 + (entry.reached / (teamList.length || 1)) * 0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Points distribution */}
      {teamList.length > 1 && (
        <Suspense fallback={null}>
          <PointsDistributionChart teams={teamList} />
        </Suspense>
      )}

      {/* Live teams table */}
      {rankedTeams.length > 0 && (
        <div className="rally-surface rounded-xl border border-border p-5 shadow-[var(--rally-shadow-sm)]">
          <h3 className="rally-display mb-4 text-base font-bold text-foreground">
            Equipas ao vivo
          </h3>
          <div className="flex flex-col gap-2">
            {rankedTeams.map((team, index) => (
              <div
                key={team.id}
                className="flex items-center gap-[13px] rounded-[12px] bg-muted/40 px-[14px] py-[11px]"
              >
                <span className="rally-display w-6 text-center text-base font-bold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full rally-bg-accent-soft rally-accent text-xs font-bold">
                  {initialsOf(team.name)}
                </span>
                <span className="flex-1 truncate text-sm font-semibold text-foreground">
                  {team.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {checkpointsTotal
                    ? `${team.last_checkpoint_number ?? 0}/${checkpointsTotal} postos`
                    : `${team.last_checkpoint_number ?? 0} postos`}
                </span>
                <span className="rally-display shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                  {team.total}
                  <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">pts</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
