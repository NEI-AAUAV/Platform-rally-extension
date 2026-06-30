import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel, Image, CheckCircle2, AlertCircle } from "lucide-react";
import { DeferredJudgingService, type DeferredResultResponse } from "@/client";

export default function DeferredJudgingTab() {
  const qc = useQueryClient();
  const [judging, setJudging] = useState<{ id: number; points: string; notes: string } | null>(null);

  const { data: pending = [], isLoading } = useQuery<DeferredResultResponse[]>({
    queryKey: ["deferred-pending"],
    queryFn: () => DeferredJudgingService.listPendingJudgmentsApiRallyV1ActivitiesDeferredPendingGet(),
    refetchInterval: 30_000,
  });

  const judgeMutation = useMutation({
    mutationFn: ({ resultId, points, notes }: { resultId: number; points: number; notes?: string }) =>
      DeferredJudgingService.judgeDeferredResultApiRallyV1ActivitiesResultsResultIdJudgePut(resultId, {
        points,
        notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deferred-pending"] });
      setJudging(null);
    },
  });

  const submitJudge = (resultId: number) => {
    if (!judging || judging.id !== resultId) return;
    const points = parseFloat(judging.points);
    if (isNaN(points)) return;
    judgeMutation.mutate({ resultId, points, notes: judging.notes || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        A carregar julgamentos pendentes…
      </div>
    );
  }

  if (pending.length === 0) {
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

      <ul className="space-y-3">
        {pending.map((result) => {
          const isJudgingThis = judging?.id === result.id;
          return (
            <li key={result.id} className="rally-surface space-y-3 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    Equipa #{result.team_id} — Atividade #{result.activity_id}
                  </p>
                  <p className="text-xs text-muted-foreground">Resultado #{result.id}</p>
                </div>
                {!isJudgingThis && (
                  <button
                    type="button"
                    className="rally-press rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    onClick={() => setJudging({ id: result.id, points: "", notes: "" })}
                  >
                    Julgar
                  </button>
                )}
              </div>

              {/* Media thumbnails */}
              {result.media_urls && result.media_urls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {result.media_urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <img
                        src={url}
                        alt={`Foto ${i + 1}`}
                        className="h-24 w-24 rounded-lg object-cover ring-1 ring-border transition hover:opacity-80"
                      />
                    </a>
                  ))}
                </div>
              )}
              {(!result.media_urls || result.media_urls.length === 0) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Image className="h-4 w-4" />
                  Sem fotos anexadas
                </div>
              )}

              {/* Judging form */}
              {isJudgingThis && (
                <div className="border-t pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Pontos</span>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="0–100"
                        value={judging.points}
                        onChange={(e) => setJudging({ ...judging, points: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Notas (opcional)</span>
                      <input
                        type="text"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Observações…"
                        value={judging.notes}
                        onChange={(e) => setJudging({ ...judging, notes: e.target.value })}
                      />
                    </label>
                  </div>

                  {judgeMutation.isError && (
                    <div className="flex items-center gap-2 text-xs text-red-500">
                      <AlertCircle className="h-4 w-4" />
                      Erro ao submeter julgamento. Tenta novamente.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rally-press rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      disabled={judgeMutation.isPending || !judging.points}
                      onClick={() => submitJudge(result.id)}
                    >
                      {judgeMutation.isPending ? "A submeter…" : "Confirmar"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
                      onClick={() => setJudging(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
