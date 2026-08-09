import { MapPin, GripVertical } from "lucide-react";
import { EmptyState } from "@/components/shared";
import type { UserState } from "@/stores/useUserStore";
import { useCheckpointManagement } from "./useCheckpointManagement";
import CheckpointForm from "./CheckpointForm";
import CheckpointListItem from "./CheckpointListItem";
import RouteStageManager from "./RouteStageManager";

type CheckpointManagementProps = Readonly<{
  userStore: UserState;
}>;

export default function CheckpointManagement({ userStore }: CheckpointManagementProps) {
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
    routeStatus,
    refetchCheckpoints,
    stages,
    justCreatedId,
  } = useCheckpointManagement(userStore);

  const incompleteCount = routeStatus?.incomplete_published_ids?.length ?? 0;

  return (
    <div className="space-y-6">
      <RouteStageManager onChanged={() => void refetchCheckpoints()} />

      <CheckpointForm
        form={checkpointForm}
        isEditing={!!editingCheckpoint}
        isSubmitting={isCreatingCheckpoint || isUpdatingCheckpoint}
        onSubmit={handleCheckpointSubmit}
        onCancel={cancelEdit}
        checkpoints={sortedCheckpoints}
        currentId={editingCheckpoint?.id ?? null}
        stages={stages}
      />

      <div className="rally-surface rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Checkpoints Existentes</h3>
          <p className="text-sm text-muted-foreground">
            Arraste pelos ícones <GripVertical className="mx-1 inline h-3 w-3" /> para reordenar
          </p>
        </div>
        {routeStatus && (
          <p className="mb-4 text-sm text-muted-foreground">
            {routeStatus.published_count} na rota · {routeStatus.draft_count} em rascunho
            {incompleteCount > 0 && (
              <span className="text-destructive">
                {" "}
                · {incompleteCount} publicado(s) por completar
              </span>
            )}
          </p>
        )}
        {hasCheckpoints ? (
          <ul className="list-none space-y-3">
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
                stages={stages}
                forceExpanded={checkpoint.id === justCreatedId}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<MapPin className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum checkpoint criado ainda"
            description="Crie o primeiro checkpoint para começar"
          />
        )}
      </div>
    </div>
  );
}
