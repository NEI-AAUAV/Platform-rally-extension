import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layers, Trash2 } from "lucide-react";
import {
  listRouteStages,
  createRouteStage,
  updateRouteStage,
  deleteRouteStage,
  type RouteStageResponse,
} from "@/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

type RouteStageManagerProps = Readonly<{
  /** The route list refetches after a stage change: stage order decides post order. */
  onChanged: () => void;
}>;

/**
 * Create and edit the blocks a route is divided into.
 *
 * A stage answers two questions for its own posts: must they be visited in
 * order, and how many of them count. That is what lets one route hold a
 * university block walked in sequence and a set of bars where the team picks
 * three.
 */
export default function RouteStageManager({ onChanged }: RouteStageManagerProps) {
  const toast = useAppToast();
  const [name, setName] = useState("");

  const { data: stages, refetch } = useQuery<RouteStageResponse[]>({
    queryKey: ["route-stages"],
    queryFn: async () => {
      const { data } = await listRouteStages();
      return Array.isArray(data) ? data : [];
    },
  });

  const afterChange = () => {
    void refetch();
    onChanged();
  };

  const { mutate: addStage, isPending: isAdding } = useMutation({
    mutationFn: async () =>
      createRouteStage({
        body: {
          name: name.trim(),
          order: (stages?.length ?? 0) + 1,
          order_matters: true,
          required_count: null,
        },
      }),
    onSuccess: () => {
      setName("");
      afterChange();
      toast.success("Etapa criada");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao criar a etapa")),
  });

  const { mutate: editStage } = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: { order_matters?: boolean; required_count?: number | null; name?: string };
    }) => updateRouteStage({ path: { id }, body }),
    onSuccess: afterChange,
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao atualizar a etapa")),
  });

  const { mutate: removeStage } = useMutation({
    mutationFn: async (id: number) => deleteRouteStage({ path: { id } }),
    onSuccess: () => {
      afterChange();
      toast.success("Etapa apagada — os postos ficaram sem etapa");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao apagar a etapa")),
  });

  return (
    <section className="rally-surface rounded-2xl p-6">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Layers className="h-4 w-4" />
        Etapas da rota
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Cada etapa tem a sua regra. Uma equipa só entra na etapa seguinte depois de resolver os
        postos exigidos pela anterior. Só têm efeito com a definição <strong>Etapas da rota</strong>{" "}
        ligada.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Universidade"
          aria-label="Nome da nova etapa"
          className="max-w-xs border-border bg-muted"
        />
        <BloodyButton
          type="button"
          disabled={!name.trim() || isAdding}
          onClick={() => addStage()}
        >
          Adicionar etapa
        </BloodyButton>
      </div>

      {(stages?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sem etapas — a rota corre como um bloco único.
        </p>
      ) : (
        <ul className="list-none space-y-3">
          {stages?.map((stage) => (
            <li key={stage.id} className="rounded-xl border border-border bg-card/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {stage.order}
                    </span>
                    {stage.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stage.checkpoint_ids?.length ?? 0} posto(s)
                  </p>
                </div>
                <BloodyButton
                  variant="neutral"
                  aria-label={`Apagar etapa ${stage.name}`}
                  onClick={() => removeStage(stage.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </BloodyButton>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`stage-order-${stage.id}`}
                    checked={stage.order_matters}
                    onCheckedChange={(checked) =>
                      editStage({ id: stage.id, body: { order_matters: checked } })
                    }
                  />
                  <Label htmlFor={`stage-order-${stage.id}`}>Por ordem</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`stage-required-${stage.id}`} className="whitespace-nowrap">
                    Postos exigidos
                  </Label>
                  <Input
                    id={`stage-required-${stage.id}`}
                    type="number"
                    min={0}
                    max={stage.checkpoint_ids?.length ?? undefined}
                    defaultValue={stage.required_count ?? ""}
                    placeholder="todos"
                    className="w-24 border-border bg-muted"
                    onBlur={(e) =>
                      editStage({
                        id: stage.id,
                        body: {
                          required_count: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
