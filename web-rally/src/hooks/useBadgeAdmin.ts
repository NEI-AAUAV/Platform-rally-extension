import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listBadgeDefinitions,
  createBadgeDefinition,
  updateBadgeDefinition,
  deleteBadgeDefinition,
  uploadBadgeIcon,
  manualAwardBadge,
  revokeBadge,
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
    queryFn: async () => (await listBadgeDefinitions()).data,
  });
}

/** Create / update / delete a definition + icon upload, invalidating the list. */
export function useBadgeDefinitionMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: DEFINITIONS_KEY });

  const create = useMutation({
    mutationFn: async (data: BadgeDefinitionCreate) =>
      (await createBadgeDefinition({ body: data })).data,
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: BadgeDefinitionUpdate }) =>
      (await updateBadgeDefinition({ path: { id }, body: data })).data,
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await deleteBadgeDefinition({ path: { id } })).data,
    onSuccess: invalidate,
  });

  const uploadIcon = useMutation({
    mutationFn: async ({ id, image }: { id: number; image: Blob }) =>
      (await uploadBadgeIcon({ path: { id }, body: { image } })).data,
    onSuccess: invalidate,
  });

  return { create, update, remove, uploadIcon };
}

/** Manual award + revoke, invalidating both the awards and showcase queries. */
export function useBadgeAwardMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["badges"] });

  const award = useMutation({
    mutationFn: async (data: ManualBadgeAwardCreate) =>
      (await manualAwardBadge({ body: data })).data,
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: async (badgeId: number) =>
      (await revokeBadge({ path: { badge_id: badgeId } })).data,
    onSuccess: invalidate,
  });

  return { award, revoke };
}
