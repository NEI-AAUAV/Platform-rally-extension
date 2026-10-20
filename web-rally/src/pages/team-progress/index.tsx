import { Route } from "lucide-react";
import { useTeamProgress } from "./useTeamProgress";
import useTeamNotifications from "@/hooks/useTeamNotifications";
import { getEventTerms } from "@/lib/eventTerms";
import StatusScreen from "./StatusScreen";
import TeamProgressSkeleton from "./TeamProgressSkeleton";
import TeamStatusBar from "./TeamStatusBar";
import TeamDetailsCard from "./TeamDetailsCard";
import ProgressTabs, { type ProgressTab } from "./ProgressTabs";
import { useIsDesktop } from "./useIsDesktop";
import TeamMembersCard from "./TeamMembersCard";
import NextCheckpointCard from "./NextCheckpointCard";
import RouteFinishedCard from "./RouteFinishedCard";
import RouteCheckpointItem from "./RouteCheckpointItem";
import { departureNotice } from "./checkpointHours";
import MapSection from "@/pages/checkpoints/components/MapSection";
import { findCheckpointProgress } from "@/lib/checkpointProgress";

export default function TeamProgress() {
  const {
    settings,
    team,
    checkpoints,
    isLoading,
    teamError,
    expandedCheckpoints,
    toggleCheckpoint,
    resolvedCheckpointsCount,
    resolvedOrders,
    isRouteFinished,
    openCheckpointOrders,
    hasFreeChoice,
    nextCheckpoint,
    showScore,
    showRanking,
    rank,
    totalCount,
  } = useTeamProgress();

  useTeamNotifications(team, rank);
  const isDesktop = useIsDesktop();

  if (isLoading) {
    return <TeamProgressSkeleton />;
  }

  if (!settings?.participant_view_enabled) {
    return (
      <StatusScreen
        variant="error"
        title="Vista não disponível"
        description="A vista de participante está atualmente desativada pelos administradores."
      />
    );
  }

  if (teamError || !team) {
    return (
      <StatusScreen
        variant="error"
        title="Erro ao carregar"
        description="Não foi possível carregar o progresso da equipa."
      />
    );
  }

  // Same convention as every other consumer (nav-tabs, MobileBottomNav,
  // home): the map is opt-in, so an unloaded or absent setting means hidden
  // rather than briefly flashing the route.
  const showMap = settings?.show_checkpoint_map === true;
  // Team roster/access code already live at /team-info (in the bottom nav)
  // for peddy paper, so they aren't duplicated here for that event type.
  const isPeddyPaper = settings?.event_type === "peddy_paper";
  const terms = getEventTerms(settings?.event_type);
  const notYetDeparted = departureNotice(
    settings?.rally_start_time,
    team.start_offset_minutes ?? 0,
  );

  // The server says so. `!nextCheckpoint` was also true whenever
  // `current_checkpoint_number` named an order outside the returned slice —
  // the normal case with stages — so a team with posts still to visit was
  // shown "Chegaram ao fim!".
  const isFinished = isRouteFinished;
  // A free-choice stage can leave several posts reachable at once — say so
  // instead of presenting one of them as if it were the only option, which
  // would read as the app arbitrarily picking for the team.
  const freeChoiceNotice = hasFreeChoice && (
    <p className="rally-bg-accent-soft flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-foreground">
      <Route className="h-4 w-4 shrink-0" />
      {openCheckpointOrders.length} {terms.checkpoints} disponíveis — escolham por onde continuar
      (os outros estão no Percurso).
    </p>
  );
  const nextCheckpointCard = nextCheckpoint ? (
    <>
      {freeChoiceNotice}
      <NextCheckpointCard
        checkpoint={nextCheckpoint}
        checkpointProgress={findCheckpointProgress(team, nextCheckpoint.id)}
        showMap={showMap}
        notYetDeparted={notYetDeparted}
      />
    </>
  ) : (
    isFinished && (
      <RouteFinishedCard
        resolvedCount={resolvedCheckpointsCount}
        totalCount={totalCount}
        showScore={showScore}
        total={team.total}
      />
    )
  );
  const mapSection = showMap && checkpoints && checkpoints.length > 0 && (
    <MapSection
      checkpoints={checkpoints}
      // A redacted next checkpoint has no coordinates — nothing to fly to,
      // and selecting it would print a "Posto selecionado" label over a
      // pin that isn't there.
      selectedCheckpoint={
        nextCheckpoint?.latitude != null && nextCheckpoint?.longitude != null
          ? nextCheckpoint
          : null
      }
    />
  );
  const header = (
    <TeamStatusBar
      team={team}
      showScore={showScore}
      showRanking={showRanking}
      rank={rank}
      resolvedCount={resolvedCheckpointsCount}
      totalCount={totalCount}
    />
  );

  const hasRoute = !!checkpoints && checkpoints.length > 0;
  const route = hasRoute && (
    <section aria-labelledby="route-heading" className="rally-surface p-2 sm:p-3">
      <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2">
        <h2 id="route-heading" className="rally-eyebrow">
          Percurso
        </h2>
        <span className="rally-num text-xs font-bold text-muted-foreground">
          {resolvedCheckpointsCount}/{totalCount}
        </span>
      </div>
      <ol className="space-y-0.5">
        {checkpoints.map((checkpoint, index) => (
          <RouteCheckpointItem
            key={checkpoint.id}
            checkpoint={checkpoint}
            index={index}
            team={team}
            resolvedOrders={resolvedOrders}
            showScore={showScore}
            showMap={showMap}
            isExpanded={expandedCheckpoints.has(index)}
            onToggle={toggleCheckpoint}
            // The main card already offers the post it renders; this is
            // for the *other* posts a free-choice stage leaves open, so
            // the team is not funnelled into whichever one the app
            // happened to pick.
            offerCheckIn={checkpoint.is_reachable === true && checkpoint.id !== nextCheckpoint?.id}
            notYetDeparted={notYetDeparted}
          />
        ))}
      </ol>
    </section>
  );

  const teamPanel = (
    <div className="space-y-4">
      <TeamDetailsCard team={team} rallyStartTime={settings?.rally_start_time} />
      {!isPeddyPaper && <TeamMembersCard team={team} />}
    </div>
  );
  const nowPanel = nextCheckpointCard ? (
    // Room below for the floating check-in bar on phones.
    <div className="space-y-3 pb-40 lg:pb-0">{nextCheckpointCard}</div>
  ) : (
    <p className="rally-surface p-6 text-center text-sm text-muted-foreground">
      Sem {terms.checkpoint} ativo de momento.
    </p>
  );

  const tabs: ProgressTab[] = [
    { id: "agora", label: "Agora", panel: nowPanel },
    ...(hasRoute
      ? [
          {
            id: "percurso" as const,
            label: "Percurso",
            badge: `${resolvedCheckpointsCount}/${totalCount}`,
            panel: route,
          },
        ]
      : []),
    ...(mapSection ? [{ id: "mapa" as const, label: "Mapa", panel: mapSection }] : []),
    { id: "equipa", label: "Equipa", panel: teamPanel },
  ];

  // Phones get one view at a time behind tabs; from lg the current task
  // stays pinned on the left while the map and route sit beside it.
  return (
    <div className="space-y-4 duration-500 animate-in fade-in lg:space-y-6">
      {header}
      {isDesktop ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6 lg:sticky lg:top-24">
            {nowPanel}
            {teamPanel}
          </div>
          <div className="space-y-6">
            {mapSection}
            {route}
          </div>
        </div>
      ) : (
        <ProgressTabs tabs={tabs} />
      )}
    </div>
  );
}
