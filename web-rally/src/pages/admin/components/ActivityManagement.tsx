import React from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { BloodyButton } from '@/components/themes/bloody';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ActivityForm from '@/components/ActivityCreateForm';
import ActivityList from '@/components/ActivityList';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivities';
import type { Activity as ActivityType } from '@/types/activityTypes';
import type { ActivityCreate, ActivityListResponse } from '@/client';
import { useAppToast } from '@/hooks/use-toast';

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  order: number;
}

interface ActivityManagementProps {
  checkpoints: Checkpoint[];
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    body?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };

  if (typeof candidate.body?.detail === "string") {
    return candidate.body.detail;
  }

  if (typeof candidate.response?.data?.detail === "string") {
    return candidate.response.data.detail;
  }

  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return candidate.message;
  }

  return fallback;
};

export default function ActivityManagement({ checkpoints }: ActivityManagementProps) {
  const [editingActivity, setEditingActivity] = React.useState<ActivityType | null>(null);
  const [showActivityForm, setShowActivityForm] = React.useState(false);
  const toast = useAppToast();

  // Activities queries and mutations
  const { data: activitiesData } = useActivities();
  const { 
    mutate: createActivity, 
    isPending: isCreatingActivity, 
    error: createActivityError
  } = useCreateActivity();
  const { mutate: updateActivity, isPending: isUpdatingActivity } = useUpdateActivity();
  const { mutate: deleteActivity, isPending: isDeletingActivity } = useDeleteActivity();

  const handleCreateActivity = (data: ActivityCreate) => {
    createActivity(data, {
      onSuccess: () => {
        setShowActivityForm(false);
        setEditingActivity(null);
        toast.success("Atividade criada com sucesso!");
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, "Erro ao criar atividade"));
      },
    });
  };

  const handleUpdateActivity = (data: ActivityCreate) => {
    if (!editingActivity) return;
    
    updateActivity(
      { id: editingActivity.id, activity: data },
      {
        onSuccess: () => {
          setEditingActivity(null);
          setShowActivityForm(false);
          toast.success("Atividade atualizada com sucesso!");
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, "Erro ao atualizar atividade"));
        },
      }
    );
  };

  const handleEditActivity = (activity: ActivityType) => {
    setEditingActivity(activity);
    setShowActivityForm(true);
  };

  const handleDeleteActivity = (id: number) => {
    if (confirm('Tem certeza que deseja deletar esta atividade?')) {
      deleteActivity(id, {
        onSuccess: () => {
          toast.success("Atividade deletada com sucesso!");
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, "Erro ao deletar atividade"));
        },
      });
    }
  };


  return (
    <div className="space-y-6">

      {showActivityForm ? (
        <ActivityForm
          checkpoints={checkpoints}
          onSubmit={(data) => {
            const mutation = editingActivity ? handleUpdateActivity : handleCreateActivity;
            mutation(data);
          }}
          onCancel={() => {
            setShowActivityForm(false);
            setEditingActivity(null);
          }}
          isLoading={isCreatingActivity || isUpdatingActivity}
          error={createActivityError?.message}
          initialData={editingActivity ? {
            name: editingActivity.name,
            description: editingActivity.description,
            activity_type: editingActivity.activity_type,
            checkpoint_id: editingActivity.checkpoint_id,
            config: editingActivity.config,
            is_active: editingActivity.is_active,
          } : undefined}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <BloodyButton
              onClick={() => setShowActivityForm(true)}
              disabled={!checkpoints || checkpoints.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Atividade
            </BloodyButton>
          </div>

          {!checkpoints || checkpoints.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                É necessário criar pelo menos um checkpoint antes de criar atividades.
              </AlertDescription>
            </Alert>
          ) : (
            <ActivityList
              activities={(activitiesData as ActivityListResponse | undefined)?.activities ?? []}
              checkpoints={checkpoints}
              onEdit={handleEditActivity}
              onDelete={handleDeleteActivity}
              isDeleting={isDeletingActivity}
            />
          )}
        </div>
      )}
    </div>
  );
}
