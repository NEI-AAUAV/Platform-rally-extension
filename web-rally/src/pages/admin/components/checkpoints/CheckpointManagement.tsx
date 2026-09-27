import { useEffect, useRef } from "react";
import { MapPin, GripVertical, Crosshair, X } from "lucide-react";
import { EmptyState } from "@/components/shared";
import type { UserState } from "@/stores/useUserStore";
import { useCheckpointManagement } from "./useCheckpointManagement";
import CheckpointForm from "./CheckpointForm";
import CheckpointListItem from "./CheckpointListItem";
import CheckpointDetailsPanel from "./CheckpointDetailsPanel";
import RouteStageManager from "./RouteStageManager";

type CheckpointManagementProps = Readonly<{
  userStore: UserState;
  /** Checkpoints a readiness issue pointed at (from `?highlight=`). */
  highlightIds?: readonly number[];
  onClearHighlight?: () => void;
}>;

const NO_HIGHLIGHT: readonly number[] = [];

export default function CheckpointManagement({
  userStore,
  highlightIds = NO_HIGHLIGHT,
  onClearHighlight,
}: CheckpointManagementProps) {
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
    selectedCheckpointId,
    pendingDraftId,
    startDraftCheckpoint,
    isStartingDraft,
    pendingClueImage,
    setPendingClueImage,
  } = useCheckpointManagement(userStore);

  const incompleteCount = routeStatus?.incomplete_published_ids?.length ?? 0;

  const highlighted = new Set(highlightIds);
  const highlightedCount = sortedCheckpoints.filter((cp) => highlighted.has(cp.id)).length;
  const firstHighlightedId = sortedCheckpoints.find((cp) => highlighted.has(cp.id))?.id;

  // Bring the first affected post into view once it has loaded — once per
  // highlight set, so later refetches don't keep yanking the scroll.
  const scrolledFor = useRef<string | null>(null);
  const highlightKey = highlightIds.join(",");
  useEffect(() => {
    if (firstHighlightedId == null || scrolledFor.current === highlightKey) return;
    scrolledFor.current = highlightKey;
    document
      .querySelector(`[data-checkpoint-id="${firstHighlightedId}"]`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [firstHighlightedId, highlightKey]);
  const selectedCheckpointName = sortedCheckpoints.find(
    (cp) => cp.id === selectedCheckpointId,
  )?.name;

  return (
    <div className="space-y-6">
      <RouteStageManager onChanged={() => void refetchCheckpoints()} />

      <div>
        <CheckpointForm
          form={checkpointForm}
          isEditing={!!editingCheckpoint}
          isSubmitting={isCreatingCheckpoint || isUpdatingCheckpoint}
          onSubmit={handleCheckpointSubmit}
          onCancel={cancelEdit}
          checkpoints={sortedCheckpoints}
          currentId={editingCheckpoint?.id ?? pendingDraftId ?? null}
          stages={stages}
          pendingClueImage={pendingClueImage}
          onPendingClueImageChange={setPendingClueImage}
          hasAttachedPanel
          hasPendingDraft={!!pendingDraftId}
          onStartDraft={startDraftCheckpoint}
          isStartingDraft={isStartingDraft}
        />
        <CheckpointDetailsPanel
          checkpointId={selectedCheckpointId}
          checkpointName={selectedCheckpointName}
        />
      </div>

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
        {highlightIds.length > 0 && (
          <output
            className="mb-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm"
          >
            <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1">
              {highlightedCount > 0
                ? `${highlightedCount} posto(s) assinalado(s) pela verificação de prontidão.`
                : "Os postos assinalados pela verificação de prontidão já não existem."}
            </span>
            {onClearHighlight && (
              <button
                type="button"
                onClick={onClearHighlight}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Limpar destaque
              </button>
            )}
          </output>
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
                isHighlighted={highlighted.has(checkpoint.id)}
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
