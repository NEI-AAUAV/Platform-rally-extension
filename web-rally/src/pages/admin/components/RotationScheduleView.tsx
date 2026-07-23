import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users } from "lucide-react";
import { getTeams, getCheckpoints } from "@/client";

/**
 * A single rotation slot: which team sits at which checkpoint this round.
 * The backend types `rounds` loosely (`Array<Array<Record<string, unknown>>>`),
 * so we narrow the two ids we rely on here.
 */
interface RotationPair {
  team_id: number;
  checkpoint_id: number;
}

interface RotationScheduleViewProps {
  /** Rounds as returned by POST /events/{id}/rotation-schedule. */
  rounds: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;
}

function asPair(raw: Record<string, unknown>): RotationPair | null {
  const teamId = raw.team_id;
  const checkpointId = raw.checkpoint_id;
  if (typeof teamId !== "number" || typeof checkpointId !== "number") return null;
  return { team_id: teamId, checkpoint_id: checkpointId };
}

/**
 * Renders the generated round-robin rotation as a per-round schedule, resolving
 * team and checkpoint ids to names. Falls back to raw ids while names load or
 * when an id can't be resolved.
 */
export default function RotationScheduleView({ rounds }: Readonly<RotationScheduleViewProps>) {
  const { data: teams } = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () => {
      const { data } = await getTeams();
      return data;
    },
  });
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints", "all"],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data;
    },
  });

  const teamName = useMemo(() => {
    const map = new Map<number, string>((teams ?? []).map((t) => [t.id, t.name]));
    return (id: number) => map.get(id) ?? `Equipa #${id}`;
  }, [teams]);

  const checkpointName = useMemo(() => {
    const map = new Map<number, string>((checkpoints ?? []).map((c) => [c.id, c.name]));
    return (id: number) => map.get(id) ?? `Checkpoint #${id}`;
  }, [checkpoints]);

  if (rounds.length === 0) {
    return <p className="text-xs text-muted-foreground">Escalonamento vazio.</p>;
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rounds.map((round, roundIdx) => {
        const pairs = round.map(asPair).filter((p): p is RotationPair => p !== null);
        const pairKeys = pairs.map((p) => p.team_id + ":" + p.checkpoint_id).join(",");
        const roundKey = pairs.length > 0 ? `round-${pairKeys}` : `round-empty-${roundIdx}`;
        return (
          <section
            key={roundKey}
            className="rounded-xl border border-border/60 bg-card/60 p-3 shadow-sm"
            aria-label={`Ronda ${roundIdx + 1}`}
          >
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ronda {roundIdx + 1}
            </h4>
            <ul className="space-y-1.5">
              {pairs.map((pair) => (
                <li
                  key={`${pair.team_id}-${pair.checkpoint_id}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {teamName(pair.team_id)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {checkpointName(pair.checkpoint_id)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
