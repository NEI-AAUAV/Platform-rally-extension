import { useQuery } from "@tanstack/react-query";
import { Navigate, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import { useUserStore } from "@/stores/useUserStore";
import useTeamAuth from "@/hooks/useTeamAuth";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import useEventTerms from "@/hooks/useEventTerms";
import { getCheckpoints, getTeams, type ListingTeam } from "@/client";
import { Podium, ScoreRows, ScoreboardSkeleton } from "./components/ScoreList";
import { ProvisionalBadge, FreshnessIndicator } from "@/components/shared";
import { useCountdown } from "@/pages/home/useCountdown";

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
  const terms = useEventTerms();
  const { phase } = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const isProvisional = phase === "live";
  useScoreboardStream([["teams"]]);

  const {
    data: teams,
    isLoading: teamsLoading,
    dataUpdatedAt: teamsUpdatedAt,
  } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
  });
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => (await getCheckpoints()).data,
    retry: false,
  });
  const checkpointsCount = Array.isArray(checkpoints) ? checkpoints.length : undefined;

  const sortedTeams = teams
    ? [...teams].sort((a: ListingTeam, b: ListingTeam) => a.classification - b.classification)
    : undefined;

  const { scopes } = useUserStore((state) => state);
  const isAdminOrManager =
    scopes !== undefined &&
    (scopes.includes("admin") ||
      scopes.includes("manager-rally") ||
      scopes.includes("rally:admin"));
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
              <a
                href="/rally/team-login"
                className="rally-accent mt-2 inline-block font-semibold hover:underline"
              >
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

  const showSkeleton = teamsLoading && list.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="rally-accent text-xs font-bold uppercase tracking-[0.2em]">
            Pontuação ao vivo
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="rally-display text-4xl font-bold text-foreground sm:text-5xl">
              Classificação
            </h1>
            {isProvisional && <ProvisionalBadge />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isFullBoard && (
            <p className="text-sm font-medium text-muted-foreground">
              {list.length} equipas em {terms.event}
            </p>
          )}
          <FreshnessIndicator updatedAt={teamsUpdatedAt} />
        </div>
      </header>

      {showSkeleton && <ScoreboardSkeleton />}
      {!showSkeleton && list.length === 0 && (
        <div className="rally-surface flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">Ainda não há equipas classificadas.</p>
        </div>
      )}
      {!showSkeleton && list.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* Left: podium + rows */}
          <div className="space-y-6">
            <Podium
              teams={podium}
              checkpointsCount={checkpointsCount}
              isProvisional={isProvisional}
            />
            {rest.length > 0 && (
              <ScoreRows
                teams={rest}
                startRank={4}
                checkpointsCount={checkpointsCount}
                isProvisional={isProvisional}
              />
            )}
          </div>

          {/* Aside */}
          <aside className="order-first space-y-4 lg:order-last">
            {!myTeam && (
              <div className="rally-surface rally-elevate relative overflow-hidden p-6">
                <div
                  aria-hidden
                  className="rally-bg-accent-soft pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
                />
                <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    A tua equipa
                  </p>
                  <p className="mt-3 font-bold leading-snug text-foreground">
                    Entra com a tua equipa para veres a tua posição e progresso ao vivo.
                  </p>
                  <Link
                    to="/team-login"
                    className="rally-bg-accent mt-4 block w-full rounded-[12px] py-3 text-center text-sm font-bold text-white"
                  >
                    Entrar com a Equipa
                  </Link>
                </div>
              </div>
            )}
            {myTeam &&
              (() => {
                const myRank = myRankIndex + 1;
                const thirdPlace = sortedTeams?.[2];
                const gapToPodium =
                  myRank > 3 && thirdPlace ? thirdPlace.total - myTeam.total + 1 : null;
                return (
                  <div className="rally-surface rally-elevate relative overflow-hidden p-6">
                    <div
                      aria-hidden
                      className="rally-bg-accent-soft pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
                    />
                    <div className="relative z-10">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        A tua equipa
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="rally-display text-4xl font-bold text-foreground">
                          #{myRank}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          de {sortedTeams?.length}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-bold text-foreground">{myTeam.name}</p>
                      <p
                        className={[
                          "rally-display rally-accent mt-1 text-3xl font-bold tabular-nums",
                          isProvisional ? "italic" : "",
                        ].join(" ")}
                      >
                        {myTeam.total}
                        <span className="ml-1 text-sm font-medium text-muted-foreground">pts</span>
                      </p>
                      {gapToPodium !== null && (
                        <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                          Faltam{" "}
                          <strong className="font-bold text-foreground">{gapToPodium} pts</strong>{" "}
                          para o pódio.
                        </p>
                      )}
                      {myRank <= 3 && (
                        <p className="rally-accent mt-4 border-t border-border pt-4 text-sm font-semibold">
                          No pódio! Mantém a posição.
                        </p>
                      )}
                      <Link
                        to="/team-progress"
                        className="rally-bg-accent mt-4 block w-full rounded-[12px] py-3 text-center text-sm font-bold text-white"
                      >
                        Ver progresso
                      </Link>
                    </div>
                  </div>
                );
              })()}
          </aside>
        </div>
      )}
    </div>
  );
}
