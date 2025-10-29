import React from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { BloodyButton } from '@/components/themes/bloody';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ActivityForm from '@/components/ActivityForm';
import ActivityList from '@/components/ActivityList';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivities';
import type { Activity as ActivityType } from '@/types/activityTypes';
import type { ActivityCreate } from '@/client';
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

export default function ActivityManagement({ checkpoints }: ActivityManagementProps) {
  const [editingActivity, setEditingActivity] = React.useState<ActivityType | null>(null);
  const [showActivityForm, setShowActivityForm] = React.useState(false);
  const toast = useAppToast();

  // Activities queries and mutations
  const { data: activities } = useActivities();
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
      onError: (error: any) => {
        const errorMessage = error?.body?.detail || 
                            error?.response?.data?.detail || 
                            error?.message || 
                            "Erro ao criar atividade";
        toast.error(errorMessage);
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
        onError: (error: any) => {
          const errorMessage = error?.body?.detail || 
                              error?.response?.data?.detail || 
                              error?.message || 
                              "Erro ao atualizar atividade";
          toast.error(errorMessage);
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
        onError: (error: any) => {
          const errorMessage = error?.body?.detail || 
                              error?.response?.data?.detail || 
                              error?.message || 
                              "Erro ao deletar atividade";
          toast.error(errorMessage);
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
            mutation(data as any);
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
              activities={(activities?.activities as any) || []}
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
