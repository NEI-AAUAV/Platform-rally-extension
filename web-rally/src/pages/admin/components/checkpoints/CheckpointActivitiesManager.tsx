import { useState } from "react";
import { Dumbbell, Plus, Edit, Trash2 } from "lucide-react";
import ActivityForm from "@/components/activity-form/ActivityCreateForm";
import {
  useActivities,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from "@/hooks/useActivities";
import {
  ActivityType as CustomActivityType,
  type ActivityCreate as CustomActivityCreate,
} from "@/types/activityTypes";
import type {
  ActivityCreate as ClientActivityCreate,
  ActivityListResponse,
  ActivityResponse,
  ActivityType as ClientActivityType,
} from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

type Props = Readonly<{
  checkpointId: number;
}>;

const activityTypeLabels: Record<string, string> = {
  TimeBasedActivity: "Baseada em tempo",
  ScoreBasedActivity: "Baseada em pontuação",
  BooleanActivity: "Sim/Não",
  TeamVsActivity: "Equipa vs equipa",
  GeneralActivity: "Geral",
  DeferredJudgedActivity: "Avaliação posterior (fotos)",
};

/**
 * The desafio for one post, created and edited without leaving the post's
 * own panel.
 *
 * Wraps the same `ActivityCreateForm` the full Activities tab uses — this is
 * not a lighter/different editor, just the checkpoint picker hidden and
 * pre-filled, since the checkpoint is already decided by which panel this is.
 */
export default function CheckpointActivitiesManager({ checkpointId }: Props) {
  const toast = useAppToast();
  const [editingActivity, setEditingActivity] = useState<ActivityResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: activitiesData } = useActivities();
  const {
    mutate: createActivity,
    isPending: isCreating,
    error: createError,
  } = useCreateActivity();
  const { mutate: updateActivity, isPending: isUpdating } = useUpdateActivity();
  const { mutate: deleteActivity } = useDeleteActivity();

  const activities = (
    (activitiesData as ActivityListResponse | undefined)?.activities ?? []
  ).filter((a): a is ActivityResponse => a.checkpoint_id === checkpointId);

  const closeForm = () => {
    setShowForm(false);
    setEditingActivity(null);
  };

  const handleSubmit = (data: CustomActivityCreate) => {
    const clientData: ClientActivityCreate = {
      name: data.name,
      description: data.description ?? null,
      activity_type: data.activity_type as unknown as ClientActivityType,
      checkpoint_id: checkpointId,
      config: data.config as Record<string, unknown>,
      is_active: data.is_active,
    };
    if (editingActivity) {
      updateActivity(
        { id: editingActivity.id, activity: clientData },
        {
          onSuccess: () => {
            closeForm();
            toast.success("Desafio atualizado!");
          },
          onError: (error) => toast.error(getErrorMessage(error, "Erro ao atualizar desafio")),
        },
      );
      return;
    }
    createActivity(clientData, {
      onSuccess: () => {
        closeForm();
        toast.success("Desafio criado!");
      },
      onError: (error) => toast.error(getErrorMessage(error, "Erro ao criar desafio")),
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Apagar este desafio?")) return;
    deleteActivity(id, {
      onSuccess: () => toast.success("Desafio apagado."),
      onError: (error) => toast.error(getErrorMessage(error, "Erro ao apagar desafio")),
    });
  };

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="h-4 w-4 text-primary" />
        Desafio
        <span className="text-xs font-normal text-muted-foreground">({activities.length})</span>
      </div>

      {showForm ? (
        <ActivityForm
          checkpoints={[]}
          lockCheckpointId={checkpointId}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          isLoading={isCreating || isUpdating}
          error={createError?.message}
          initialData={
            editingActivity
              ? {
                  name: editingActivity.name,
                  description: editingActivity.description ?? undefined,
                  activity_type: editingActivity.activity_type as unknown as CustomActivityType,
                  checkpoint_id: checkpointId,
                  config: editingActivity.config as Record<string, string | number | boolean>,
                  is_active: editingActivity.is_active ?? true,
                }
              : undefined
          }
        />
      ) : (
        <>
          {activities.length > 0 && (
            <ul className="space-y-2">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <div className="text-sm">
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {activityTypeLabels[activity.activity_type] ?? activity.activity_type}
                      {!activity.is_active && " · inativa"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingActivity(activity);
                        setShowForm(true);
                      }}
                      className="text-muted-foreground transition hover:text-foreground"
                      aria-label={`Editar ${activity.name}`}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(activity.id)}
                      className="text-muted-foreground transition hover:text-destructive"
                      aria-label={`Apagar ${activity.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <BloodyButton type="button" variant="neutral" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            <span className="ml-1.5">
              {activities.length > 0 ? "Adicionar outro desafio" : "Criar desafio"}
            </span>
          </BloodyButton>
        </>
      )}
    </section>
  );
}
