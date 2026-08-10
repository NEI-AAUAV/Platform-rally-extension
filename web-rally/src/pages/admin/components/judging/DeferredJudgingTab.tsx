import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel, Image, CheckCircle2, AlertCircle, ArrowUp, ArrowDown, Trophy } from "lucide-react";
import {
  listPendingJudgments,
  rankDeferredResults,
  getActivities,
  type DeferredResultResponse,
  type ActivityResponse,
} from "@/client";

/** Move the item at `index` one slot toward `direction` (immutable). */
function reorder<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

type RankingGroupProps = Readonly<{
  activityId: number;
  activityName: string;
  results: readonly DeferredResultResponse[];
  onRanked: () => void;
}>;

/**
 * One post's captures, side by side, ranked instead of scored one at a time.
 *
 * The order IS the score: 1st place gets the activity's configured
 * max_points, last gets min_points, linearly in between (see
 * `app/services/ranking.py`) — closer to how "mais criativo" actually gets
 * judged than typing a number per photo.
 */
function RankingGroup({ activityId, activityName, results, onRanked }: RankingGroupProps) {
  const [order, setOrder] = useState<number[]>(() => results.map((r) => r.id));
  const byId = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);

  const rankMutation = useMutation({
    mutationFn: () =>
      rankDeferredResults({
        path: { activity_id: activityId },
        body: { ordered_result_ids: order },
      }),
    onSuccess: onRanked,
  });

  const move = (index: number, direction: -1 | 1) =>
    setOrder((prev) => reorder(prev, index, direction));

  return (
    <li className="rally-surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">{activityName}</p>
          <p className="text-xs text-muted-foreground">
            {results.length} equipa(s) — usa as setas para ordenar do melhor para o pior
          </p>
        </div>
        <button
          type="button"
          className="rally-press rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          disabled={rankMutation.isPending}
          onClick={() => rankMutation.mutate()}
        >
          {rankMutation.isPending ? "A submeter…" : "Confirmar ordenação"}
        </button>
      </div>

      {rankMutation.isError && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertCircle className="h-4 w-4" />
          Erro ao submeter a ordenação. Tenta novamente.
        </div>
      )}

      <ol className="space-y-2">
        {order.map((resultId, index) => {
          const result = byId.get(resultId);
          if (!result) return null;
          return (
            <li
              key={resultId}
              className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {index === 0 ? <Trophy className="h-4 w-4" /> : index + 1}
              </span>

              {result.media_urls.length > 0 ? (
                <div className="flex gap-1.5 overflow-x-auto">
                  {result.media_urls.map((url, i) => (
                    <img
                      key={url}
                      src={url}
                      alt={`Foto ${i + 1} da equipa #${result.team_id}`}
                      className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-border"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Image className="h-4 w-4" />
                  Sem fotos
                </div>
              )}

              <span className="ml-auto text-sm font-medium">Equipa #{result.team_id}</span>

              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Subir equipa #${result.team_id}`}
                  className="rounded p-1 text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Descer equipa #${result.team_id}`}
                  className="rounded p-1 text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

export default function DeferredJudgingTab() {
  const qc = useQueryClient();

  const { data: pending = [], isLoading } = useQuery<DeferredResultResponse[]>({
    queryKey: ["deferred-pending"],
    queryFn: async () => {
      const { data } = await listPendingJudgments();
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // Names for the group headers — the pending list only carries activity_id.
  const { data: activities = [] } = useQuery<ActivityResponse[]>({
    queryKey: ["activities"],
    queryFn: async () => {
      const { data } = await getActivities();
      return data?.activities ?? [];
    },
  });
  const activityNames = useMemo(() => new Map(activities.map((a) => [a.id, a.name])), [activities]);

  const groups = useMemo(() => {
    const byActivity = new Map<number, DeferredResultResponse[]>();
    for (const result of pending) {
      const list = byActivity.get(result.activity_id) ?? [];
      list.push(result);
      byActivity.set(result.activity_id, list);
    }
    return [...byActivity.entries()];
  }, [pending]);

  const onRanked = () => {
    void qc.invalidateQueries({ queryKey: ["deferred-pending"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        A carregar julgamentos pendentes…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rally-surface flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="font-semibold">Sem julgamentos pendentes</p>
        <p className="text-sm text-muted-foreground">
          Quando o staff fotografar equipas, as entradas aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gavel className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Julgamentos Pendentes</h2>
        <span className="ml-auto rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
          {pending.length}
        </span>
      </div>

      <ul className="space-y-4">
        {groups.map(([activityId, results]) => (
          <RankingGroup
            key={activityId}
            activityId={activityId}
            activityName={activityNames.get(activityId) ?? `Atividade #${activityId}`}
            results={results}
            onRanked={onRanked}
          />
        ))}
      </ul>
    </div>
  );
}
