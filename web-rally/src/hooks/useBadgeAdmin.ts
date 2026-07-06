import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeAdminService,
  type BadgeDefinitionCreate,
  type BadgeDefinitionResponse,
  type BadgeDefinitionUpdate,
  type ManualBadgeAwardCreate,
} from "@/client";

const DEFINITIONS_KEY = ["badge-definitions"] as const;

/** List the badge catalogue. */
export function useBadgeDefinitions() {
  return useQuery<BadgeDefinitionResponse[]>({
    queryKey: DEFINITIONS_KEY,
    queryFn: () => BadgeAdminService.listBadgeDefinitionsApiRallyV1BadgeDefinitionsGet(),
  });
}

/** Create / update / delete a definition + icon upload, invalidating the list. */
export function useBadgeDefinitionMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY });

  const create = useMutation({
    mutationFn: (data: BadgeDefinitionCreate) =>
      BadgeAdminService.createBadgeDefinitionApiRallyV1BadgeDefinitionsPost(data),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: BadgeDefinitionUpdate }) =>
      BadgeAdminService.updateBadgeDefinitionApiRallyV1BadgeDefinitionsIdPut(id, data),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      BadgeAdminService.deleteBadgeDefinitionApiRallyV1BadgeDefinitionsIdDelete(id),
    onSuccess: invalidate,
  });

  const uploadIcon = useMutation({
    mutationFn: ({ id, image }: { id: number; image: Blob }) =>
      BadgeAdminService.uploadBadgeIconApiRallyV1BadgeDefinitionsIdIconPost(id, {
        image,
      }),
    onSuccess: invalidate,
  });

  return { create, update, remove, uploadIcon };
}

/** Manual award + revoke, invalidating both the awards and showcase queries. */
export function useBadgeAwardMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["badges"] });

  const award = useMutation({
    mutationFn: (data: ManualBadgeAwardCreate) =>
      BadgeAdminService.manualAwardBadgeApiRallyV1BadgesAwardPost(data),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (badgeId: number) =>
      BadgeAdminService.revokeBadgeApiRallyV1BadgesBadgeIdDelete(badgeId),
    onSuccess: invalidate,
  });

  return { award, revoke };
}
