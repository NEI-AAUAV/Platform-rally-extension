import { Info } from "lucide-react";
import CheckpointActivitiesManager from "./CheckpointActivitiesManager";
import CheckpointMediaManager from "./CheckpointMediaManager";
import CheckpointGuideIndicationsManager from "./CheckpointGuideIndicationsManager";

type CheckpointDetailsPanelProps = Readonly<{
  /** The checkpoint being created/edited, or null before the first save. */
  checkpointId: number | null;
  /**
   * Shown in the header so it stays clear which post this panel belongs to
   * even after the form above has reset back to "create new" — selection
   * survives an update save, it does not follow the form.
   */
  checkpointName?: string;
}>;

/**
 * Attaches activities, media and guide-hint management directly under the
 * checkpoint form — the admin configures them right where they just
 * created or are editing the post, instead of hunting for a toggle further
 * down the existing-checkpoints list.
 *
 * These managers all key off `checkpoint_id`, so there is nothing to show
 * until the post has been saved at least once.
 */
export default function CheckpointDetailsPanel({
  checkpointId,
  checkpointName,
}: CheckpointDetailsPanelProps) {
  if (checkpointId == null) {
    return (
      <div className="flex items-start gap-2 rounded-b-2xl border border-t-0 border-border bg-muted/30 p-4 text-sm text-muted-foreground sm:p-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Escreve um nome e clica em "Começar a preencher" para já poderes configurar atividades,
          media e pistas do guia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-b-2xl border border-t-0 border-border bg-card/40 p-4 sm:p-6">
      {checkpointName && (
        <p className="text-xs text-muted-foreground">
          A configurar <span className="font-medium text-foreground">{checkpointName}</span>
        </p>
      )}
      <CheckpointActivitiesManager checkpointId={checkpointId} />
      <CheckpointMediaManager checkpointId={checkpointId} />
      <CheckpointGuideIndicationsManager checkpointId={checkpointId} />
    </div>
  );
}
