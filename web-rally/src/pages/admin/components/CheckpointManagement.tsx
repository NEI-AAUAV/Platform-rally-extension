import { MapPin, GripVertical } from "lucide-react";
import { useThemedComponents } from "@/components/themes";
import { EmptyState } from "@/components/shared";
import type { UserState } from "@/stores/useUserStore";
import { useCheckpointManagement } from "./useCheckpointManagement";
import CheckpointForm from "./CheckpointForm";
import CheckpointListItem from "./CheckpointListItem";

type CheckpointManagementProps = Readonly<{
  userStore: UserState;
}>;

export default function CheckpointManagement({ userStore }: CheckpointManagementProps) {
  const { Card } = useThemedComponents();
  const {
    checkpointForm,
    editingCheckpoint,
    draggedCheckpoint,
    sortedCheckpoints,
    hasCheckpoints,
    isCreatingCheckpoint,
    isUpdatingCheckpoint,
    isDeletingCheckpoint,
    handleCheckpointSubmit,
    startEditCheckpoint,
    cancelEdit,
    deleteCheckpoint,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useCheckpointManagement(userStore);

  return (
    <div className="space-y-6">
      <CheckpointForm
        form={checkpointForm}
        isEditing={!!editingCheckpoint}
        isSubmitting={isCreatingCheckpoint || isUpdatingCheckpoint}
        onSubmit={handleCheckpointSubmit}
        onCancel={cancelEdit}
      />

      <Card variant="default" padding="lg" rounded="2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Checkpoints Existentes</h3>
          <p className="text-sm text-[rgb(255,255,255,0.6)]">
            Arraste pelos ícones <GripVertical className="w-3 h-3 inline mx-1" /> para reordenar
          </p>
        </div>
        {!hasCheckpoints ? (
          <EmptyState
            icon={<MapPin className="w-8 h-8 text-[rgb(255,255,255,0.5)]" />}
            title="Nenhum checkpoint criado ainda"
            description="Crie o primeiro checkpoint para começar"
          />
        ) : (
          <ul className="space-y-3 list-none">
            {sortedCheckpoints.map((checkpoint) => (
              <CheckpointListItem
                key={checkpoint.id}
                checkpoint={checkpoint}
                isDragging={draggedCheckpoint?.id === checkpoint.id}
                isDeleting={isDeletingCheckpoint}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onEdit={startEditCheckpoint}
                onDelete={deleteCheckpoint}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
