import React from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { BloodyButton } from '@/components/themes/bloody';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared';
import ActivityForm from '@/components/ActivityForm';
import ActivityList from '@/components/ActivityList';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivities';
import type { Activity as ActivityType, ActivityCreate } from '@/types/activityTypes';

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  order: number;
}

interface ActivityManagementProps {
  checkpoints: Checkpoint[];
}

export default function ActivityManagement({ checkpoints }: ActivityManagementProps) {
  const [editingActivity, setEditingActivity] = React.useState<ActivityType | null>(null);
  const [showActivityForm, setShowActivityForm] = React.useState(false);

  // Activities queries and mutations
  const { data: activities } = useActivities();
  const { 
    mutate: createActivity, 
    isPending: isCreatingActivity, 
    error: createActivityError, 
    reset: resetCreateActivityError 
  } = useCreateActivity();
  const { mutate: updateActivity, isPending: isUpdatingActivity } = useUpdateActivity();
  const { mutate: deleteActivity, isPending: isDeletingActivity } = useDeleteActivity();

  const handleCreateActivity = (data: ActivityCreate) => {
    createActivity(data, {
      onSuccess: () => {
        setShowActivityForm(false);
        cancelEdit();
      },
      onError: (error: any) => {
        console.error('Error creating activity:', error);
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
          cancelEdit();
        },
        onError: (error: any) => {
          console.error('Error updating activity:', error);
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
        onError: (error: any) => {
          console.error('Error deleting activity:', error);
          alert(`Erro ao deletar atividade: ${error.message}`);
        },
      });
    }
  };

  const cancelEdit = () => {
    setEditingActivity(null);
    setShowActivityForm(false);
    resetCreateActivityError();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">Gestão de Atividades</h3>
        <p className="text-[rgb(255,255,255,0.7)]">
          Criar e gerenciar atividades para os checkpoints
        </p>
      </div>

      {showActivityForm ? (
        <ActivityForm
          checkpoints={checkpoints}
          onSubmit={editingActivity ? handleUpdateActivity : handleCreateActivity}
          onCancel={cancelEdit}
          isLoading={isCreatingActivity || isUpdatingActivity}
          error={createActivityError?.message}
          initialData={editingActivity}
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
              activities={activities || []}
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
