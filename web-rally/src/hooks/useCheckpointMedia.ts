import { useQuery } from "@tanstack/react-query";
import { CheckpointMediaService, MediaKind, type CheckpointMediaResponse } from "@/client";

export interface CheckpointMediaGrouped {
  photos: CheckpointMediaResponse[];
  funFacts: CheckpointMediaResponse[];
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
    queryFn: () =>
      CheckpointMediaService.listCheckpointMediaApiRallyV1CheckpointCheckpointIdMediaGet(
        checkpointId,
      ),
    enabled,
    staleTime: 60_000,
  });

  const photos = data.filter((m) => m.kind === MediaKind.PHOTO && m.image_url).sort(byOrder);
  const funFacts = data.filter((m) => m.kind === MediaKind.FUN_FACT && m.caption).sort(byOrder);

  return { photos, funFacts, isLoading };
}
