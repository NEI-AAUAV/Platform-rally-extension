import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import {
  listCheckpointMedia,
  createCheckpointMedia,
  deleteCheckpointMedia,
  reorderCheckpointMedia,
  type CheckpointMediaResponse,
  type MediaKind,
} from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { MEDIA_KIND_CONFIG, MEDIA_KIND_ORDER } from "./media/mediaKindConfig";
import { EMPTY_DRAFT, type MediaDraft } from "./media/mediaDraft";
import CheckpointMediaRow from "./media/CheckpointMediaRow";

type CheckpointMediaManagerProps = Readonly<{
  checkpointId: number;
}>;

/** Everything a post can carry beyond its riddle text — photos, curiosities,
 * QR codes, Spotify links, plain links — one ordered mixed list, added
 * through a kind-dispatched form (see `media/mediaKindConfig.ts`) and
 * reordered with up/down arrows against the existing reorder endpoint. */
export default function CheckpointMediaManager({ checkpointId }: CheckpointMediaManagerProps) {
  const toast = useAppToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<MediaKind>("photo");
  const [draft, setDraft] = useState<MediaDraft>(EMPTY_DRAFT);

  const queryKey = ["checkpoint-media", checkpointId];

  const { data: media = [], isLoading } = useQuery<CheckpointMediaResponse[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await listCheckpointMedia({ path: { checkpoint_id: checkpointId } });
      return data ?? [];
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const addMedia = useMutation({
    mutationFn: () =>
      createCheckpointMedia({
        path: { checkpoint_id: checkpointId },
        body: {
          kind,
          caption: draft.caption || null,
          title: draft.title || null,
          content_url: draft.contentUrl || null,
          content_text: draft.contentText || null,
          image: draft.image,
        },
      }),
    onSuccess: () => {
      invalidate();
      setDraft(EMPTY_DRAFT);
      toast.success("Adicionado!");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao adicionar")),
  });

  const deleteMedia = useMutation({
    mutationFn: (mediaId: number) => deleteCheckpointMedia({ path: { media_id: mediaId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Removido.");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao remover")),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) =>
      reorderCheckpointMedia({ path: { checkpoint_id: checkpointId }, body: orderedIds }),
    onSuccess: (res) => {
      if (res.data) qc.setQueryData(queryKey, res.data);
    },
    onError: () => {
      invalidate();
      toast.error("Erro ao reordenar");
    },
  });

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next.map((m) => m.id));
  };

  const canSubmit = !addMedia.isPending;
  const { FieldsComponent } = MEDIA_KIND_CONFIG[kind];

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        Media do posto
        <span className="text-xs font-normal text-muted-foreground">({media.length})</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        media.length > 0 && (
          <ul className="space-y-2">
            {media.map((item, index) => (
              <CheckpointMediaRow
                key={item.id}
                item={item}
                isFirst={index === 0}
                isLast={index === media.length - 1}
                onMove={(direction) => moveItem(index, direction)}
                onDelete={() => deleteMedia.mutate(item.id)}
                deleteDisabled={deleteMedia.isPending}
              />
            ))}
          </ul>
        )
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap gap-1.5">
          {MEDIA_KIND_ORDER.map((k) => {
            const { label, icon: Icon } = MEDIA_KIND_CONFIG[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setDraft(EMPTY_DRAFT);
                }}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  kind === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        <FieldsComponent draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />

        <BloodyButton
          type="button"
          variant="neutral"
          onClick={() => addMedia.mutate()}
          disabled={!canSubmit}
        >
          {addMedia.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-1.5">Adicionar</span>
        </BloodyButton>
      </div>
    </div>
  );
}
