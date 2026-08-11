import { useQuery } from "@tanstack/react-query";
import { listCheckpointMedia, type CheckpointMediaResponse } from "@/client";

export interface CheckpointMediaGrouped {
  photos: CheckpointMediaResponse[];
  funFacts: CheckpointMediaResponse[];
  /** Every `qr`/`spotify`/`link` item, sorted by order — dispatched one by
   * one to `CheckpointMediaAttachment`. */
  attachments: CheckpointMediaResponse[];
  isLoading: boolean;
}

const byOrder = (a: CheckpointMediaResponse, b: CheckpointMediaResponse) =>
  (a.order ?? 0) - (b.order ?? 0);

/**
 * Fetch a checkpoint's media (photos + fun facts), grouped and ordered.
 * Shared across the public "postos" cards and the team timeline so the
 * "discover the place" content stays consistent in both surfaces.
 */
export function useCheckpointMedia(checkpointId: number, enabled = true): CheckpointMediaGrouped {
  const { data = [], isLoading } = useQuery<CheckpointMediaResponse[]>({
    queryKey: ["checkpoint-media", checkpointId],
    queryFn: async () =>
      (await listCheckpointMedia({ path: { checkpoint_id: checkpointId } })).data,
    enabled,
    staleTime: 60_000,
  });

  const photos = data.filter((m) => m.kind === "photo" && m.image_url).sort(byOrder);
  const funFacts = data.filter((m) => m.kind === "fun_fact" && m.caption).sort(byOrder);
  const attachments = data
    .filter((m) => m.kind === "qr" || m.kind === "spotify" || m.kind === "link")
    .sort(byOrder);

  return { photos, funFacts, attachments, isLoading };
}
