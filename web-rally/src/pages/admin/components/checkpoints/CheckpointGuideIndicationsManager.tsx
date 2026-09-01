import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, HelpCircle, CheckCircle2, Trash2, Loader2, Plus } from "lucide-react";
import {
  listGuideIndications,
  createGuideIndication,
  deleteGuideIndication,
  type CheckpointGuideIndication,
} from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { Input } from "@/components/ui/input";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

type Props = Readonly<{
  checkpointId: number;
}>;

const fieldClassName = "bg-muted border-border";

export default function CheckpointGuideIndicationsManager({ checkpointId }: Props) {
  const toast = useAppToast();
  const qc = useQueryClient();
  const [hint, setHint] = useState("");
  const [question, setQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");

  const queryKey = ["checkpoint-guide-indications", checkpointId];

  const { data: indications = [] } = useQuery<CheckpointGuideIndication[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await listGuideIndications({ path: { checkpoint_id: checkpointId } });
      return data ?? [];
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const addIndication = useMutation({
    mutationFn: () =>
      createGuideIndication({
        path: { checkpoint_id: checkpointId },
        body: {
          hint: hint.trim(),
          question: question.trim() || null,
          expected_answer: expectedAnswer.trim() || null,
          // length collides with existing orders after deletes; max+1 does not
          order: indications.reduce((max, i) => Math.max(max, (i.order ?? 0) + 1), 0),
        },
      }),
    onSuccess: () => {
      invalidate();
      setHint("");
      setQuestion("");
      setExpectedAnswer("");
      toast.success("Indicação adicionada!");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao adicionar indicação")),
  });

  const deleteIndication = useMutation({
    mutationFn: (id: number) => deleteGuideIndication({ path: { indication_id: id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Removido.");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao remover")),
  });

  const handleAdd = () => {
    if (hint.trim()) addIndication.mutate();
  };

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Compass className="h-4 w-4 text-primary" />
        Indicações do guia
        <span className="text-xs font-normal text-muted-foreground">({indications.length})</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Servem dois fins: o guia lê-as à equipa no local, e — se o evento tiver custo de pista
        definido — a equipa pode desbloqueá-las uma a uma na app, por esta ordem, pagando pontos.
        Escreve-as da mais vaga para a mais reveladora. A pergunta e a resposta esperada nunca são
        enviadas à equipa.
      </p>

      {indications.length > 0 && (
        <ul className="space-y-2">
          {indications.map((ind) => (
            <li
              key={ind.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
            >
              <div className="flex-1 space-y-1 text-sm">
                <p className="font-medium">{ind.hint}</p>
                {ind.question && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {ind.question}
                  </p>
                )}
                {ind.expected_answer && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {ind.expected_answer}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteIndication.mutate(ind.id)}
                disabled={deleteIndication.isPending}
                className="shrink-0 text-muted-foreground transition hover:text-destructive"
                aria-label={`Remover indicação ${typeof ind.order === "number" ? ind.order + 1 : ""} do checkpoint`.trim()}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Indicação a dar à equipa (ex: Aponta para a estátua e pergunta…)"
          className={fieldClassName}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunta (opcional)"
            className={`${fieldClassName} flex-1`}
          />
          <Input
            value={expectedAnswer}
            onChange={(e) => setExpectedAnswer(e.target.value)}
            placeholder="Resposta esperada (opcional)"
            className={`${fieldClassName} flex-1`}
          />
        </div>
        <BloodyButton
          type="button"
          variant="neutral"
          onClick={handleAdd}
          disabled={addIndication.isPending || !hint.trim()}
        >
          {addIndication.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-1.5">Adicionar indicação</span>
        </BloodyButton>
      </div>
    </section>
  );
}
