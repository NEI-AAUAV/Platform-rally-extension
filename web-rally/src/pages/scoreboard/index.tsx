import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import { useUserStore } from "@/stores/useUserStore";
import useTeamAuth from "@/hooks/useTeamAuth";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import { CheckPointService, TeamService, type ListingTeam } from "@/client";
import { Podium, ScoreRows } from "./components/ScoreList";

const PointsDistributionChart = lazy(
  () => import("@/components/scoreboard/PointsDistributionChart"),
);

function NoticeCard({ title, body }: { readonly title: string; readonly body: React.ReactNode }) {
  return (
    <div className="rally-surface rally-elevate mx-auto mt-6 max-w-lg p-8 text-center">
      <h2 className="rally-display text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function Scoreboard() {
  const { settings } = useRallySettings();
  useScoreboardStream([["teams"]]);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
    retry: false,
  });
  const checkpointsCount = Array.isArray(checkpoints) ? checkpoints.length : undefined;

  const sortedTeams = teams
    ? [...teams].sort((a: ListingTeam, b: ListingTeam) => a.classification - b.classification)
    : undefined;

  const { scopes } = useUserStore((state) => state);
  const isAdminOrManager =
    scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");
  const isPrivileged = isAdminOrManager || isStaff;

  const { isAuthenticated, teamData } = useTeamAuth();

  // Fully hidden and not privileged → route away.
  if (settings?.show_score_mode === "hidden" && !isPrivileged) {
    return <Navigate to="/postos" replace />;
  }

  // Individual mode: only team members can see their own score.
  if (settings?.show_score_mode === "individual" && !isPrivileged) {
    if (!isAuthenticated || !teamData) {
      return (
        <NoticeCard
          title="Pontuação restrita"
          body={
            <>
              A pontuação está visível apenas para membros das equipas.
              <br />
              <a href="/rally/team-login" className="rally-accent mt-2 inline-block font-semibold hover:underline">
                Fazer login
              </a>
            </>
          }
        />
      );
    }
  }

  if (
    settings?.show_live_leaderboard === false &&
    !isPrivileged &&
    settings?.show_score_mode !== "individual"
  ) {
    return (
      <NoticeCard
        title="Leaderboard indisponível"
        body="O organizador desativou a visualização do leaderboard em tempo real."
      />
    );
  }

  // Restrict to own team in individual mode.
  let displayTeams = sortedTeams;
  if (settings?.show_score_mode === "individual" && !isPrivileged && isAuthenticated && teamData) {
    displayTeams = sortedTeams?.filter((t) => t.id === teamData.team_id);
  }

  const list = displayTeams ?? [];
  const isFullBoard = list.length > 1;
  const podium = list.slice(0, 3);
  const rest = list.slice(3);

  // Locate the viewer's own team for the aside card.
  const myRankIndex =
    teamData && sortedTeams ? sortedTeams.findIndex((t) => t.id === teamData.team_id) : -1;
  const myTeam = myRankIndex >= 0 ? sortedTeams?.[myRankIndex] : undefined;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
            Classificação
          </h1>
        </div>
        {isFullBoard && (
          <p className="text-sm font-medium text-muted-foreground">
            {list.length} equipas em prova
          </p>
        )}
      </header>

      {isFullBoard && (
        <Suspense fallback={null}>
          <PointsDistributionChart teams={list} />
        </Suspense>
      )}

      {list.length === 0 ? (
        <div className="rally-surface flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">Ainda não há equipas classificadas.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* Left: podium + rows */}
          <div className="space-y-6">
            <Podium teams={podium} checkpointsCount={checkpointsCount} />
            {rest.length > 0 && (
              <ScoreRows teams={rest} startRank={4} checkpointsCount={checkpointsCount} />
            )}
          </div>

          {/* Aside */}
          <aside className="order-first space-y-4 lg:order-last">

            {myTeam && (
              <div className="rally-surface rally-elevate p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  A tua equipa
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="rally-display text-3xl font-bold text-foreground">
                    #{myRankIndex + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">de {sortedTeams?.length}</span>
                </div>
                <p className="mt-2 truncate font-semibold text-foreground">{myTeam.name}</p>
                <p className="rally-display rally-accent text-2xl font-bold tabular-nums">
                  {myTeam.total}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">pts</span>
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
