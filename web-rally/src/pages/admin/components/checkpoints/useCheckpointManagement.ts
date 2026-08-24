import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getRouteStatus,
  createCheckpoint as apiCreateCheckpoint,
  updateCheckpoint as apiUpdateCheckpoint,
  deleteCheckpoint as apiDeleteCheckpoint,
  reorderCheckpoints as apiReorderCheckpoints,
  uploadClueImage,
  type AdminCheckPoint,
  type CheckPointCreate,
  type CheckPointUpdate,
  type RouteStatus,
  type RouteStageResponse,
  listRouteStages,
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import type { UserState } from "@/stores/useUserStore";
import { getErrorMessage } from "@/utils/errorHandling";

export const checkpointFormSchema = z.object({
  name: z.string().min(1, "Nome do checkpoint é obrigatório"),
  description: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  arrival_radius_m: z.number().min(0, "O raio não pode ser negativo"),
  order: z.number().min(1, "Ordem deve ser maior que 0"),
  clue: z.string().optional(),
  clue_media_url: z.string().optional(),
  // Planning fields. A route is written one cell at a time, so none of these
  // is required — a post with only a name is a legitimate work in progress.
  staff_script: z.string().optional(),
  challenge_brief: z.string().optional(),
  is_draft: z.boolean(),
  is_placeholder: z.boolean(),
  // Empty string means "no stage" / "no window": the <select> and
  // datetime-local inputs cannot hold null.
  stage_id: z.string().optional(),
  available_from: z.string().optional(),
  available_until: z.string().optional(),
});

export type CheckpointForm = z.infer<typeof checkpointFormSchema>;
export type Checkpoint = AdminCheckPoint;

function optionalText(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

/** A datetime-local value carries no zone; treat it as the browser's own. */
function optionalTimestamp(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // datetime-local wants local wall-clock time without a zone suffix.
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toRequestBody(data: CheckpointForm): CheckPointCreate {
  return {
    name: data.name,
    description: data.description,
    latitude: data.latitude ? Number.parseFloat(data.latitude) : null,
    longitude: data.longitude ? Number.parseFloat(data.longitude) : null,
    arrival_radius_m: data.arrival_radius_m,
    order: data.order,
    // Empty inputs mean "no clue": send null so the card falls back to the
    // guided flow instead of rendering an empty riddle.
    clue: optionalText(data.clue),
    clue_media_url: optionalText(data.clue_media_url),
    staff_script: optionalText(data.staff_script),
    challenge_brief: optionalText(data.challenge_brief),
    is_draft: data.is_draft,
    is_placeholder: data.is_placeholder,
    stage_id: data.stage_id ? Number.parseInt(data.stage_id, 10) : null,
    available_from: optionalTimestamp(data.available_from),
    available_until: optionalTimestamp(data.available_until),
  };
}

export function useCheckpointManagement(userStore: UserState) {
  const toast = useAppToast();
  const [editingCheckpoint, setEditingCheckpoint] = React.useState<Checkpoint | null>(null);
  const [draggedCheckpoint, setDraggedCheckpoint] = React.useState<Checkpoint | null>(null);
  // The post whose details panel (activities/media/indicações) is attached
  // to the form: set on create and on "Editar", but — unlike
  // `editingCheckpoint` — NOT cleared when an update saves. Renaming or
  // moving a post and then saving the guide hints for it used to mean
  // clicking "Editar" all over again for every save; keeping this separate
  // means the panel just stays put across an update.
  const [selectedCheckpointId, setSelectedCheckpointId] = React.useState<number | null>(null);
  // Set by "Começar a preencher": a checkpoint created in the background so
  // the details panel can attach before the admin finishes the rest of the
  // form. Unlike `editingCheckpoint`, cancelling while this is set deletes
  // the row — it was never a deliberate save, just plumbing for the FK.
  const [pendingDraftId, setPendingDraftId] = React.useState<number | null>(null);
  // A clue image picked while there's still no checkpoint to attach it to;
  // sent right after the create mutation returns an id.
  const [pendingClueImage, setPendingClueImage] = React.useState<File | null>(null);

  // The planning view, not GET /checkpoint: it is the only one that returns
  // drafts, the staff-only columns, and what each post still lacks.
  const { data: routeStatus, refetch: refetchCheckpoints } = useQuery<RouteStatus | null>({
    queryKey: ["route-status"],
    queryFn: async () => {
      const { data } = await getRouteStatus();
      return data ?? null;
    },
    enabled: !!userStore.token,
  });
  const checkpoints = routeStatus?.checkpoints;

  // Stages are needed by the form's stage picker, and they are what decides
  // a post's position in the route.
  const { data: stages } = useQuery<RouteStageResponse[]>({
    queryKey: ["route-stages"],
    queryFn: async () => {
      const { data } = await listRouteStages();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userStore.token,
  });

  const checkpointForm = useForm<CheckpointForm>({
    resolver: zodResolver(checkpointFormSchema),
    defaultValues: {
      name: "",
      description: "",
      latitude: "",
      longitude: "",
      arrival_radius_m: 50,
      order: 1,
      clue: "",
      clue_media_url: "",
      staff_script: "",
      challenge_brief: "",
      // New posts start published: drafting is the deliberate choice, and an
      // import is the path that creates drafts in bulk.
      is_draft: false,
      is_placeholder: false,
      stage_id: "",
      available_from: "",
      available_until: "",
    },
  });

  // The image staged before the checkpoint existed goes up now that there's
  // finally an id to attach it to — shared by both paths that can be the
  // first thing to give a brand-new post an id (the classic full create,
  // and "Começar a preencher").
  const flushPendingClueImage = React.useCallback(
    async (id: number) => {
      if (!pendingClueImage) return;
      try {
        await uploadClueImage({ path: { id }, body: { image: pendingClueImage } });
      } catch (error) {
        toast.error(getErrorMessage(error, "Erro ao enviar a imagem do enigma"));
      } finally {
        setPendingClueImage(null);
      }
    },
    [pendingClueImage, toast],
  );

  const { mutate: createCheckpoint, isPending: isCreatingCheckpoint } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) =>
      apiCreateCheckpoint({ body: toRequestBody(checkpointData) }),
    onSuccess: async ({ data }) => {
      checkpointForm.reset();
      if (data?.id) setSelectedCheckpointId(data.id);
      toast.success("Checkpoint criado com sucesso!");
      if (data?.id) await flushPendingClueImage(data.id);
      void refetchCheckpoints();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar checkpoint"));
    },
  });

  // "Começar a preencher": creates the post in the background so the
  // details panel (activities/media/indicações) can attach right away,
  // without waiting for the admin to finish and submit the whole form.
  const { mutate: startDraftCheckpointMutation, isPending: isStartingDraft } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) =>
      apiCreateCheckpoint({ body: toRequestBody(checkpointData) }),
    onSuccess: async ({ data }) => {
      if (!data?.id) return;
      setPendingDraftId(data.id);
      setSelectedCheckpointId(data.id);
      toast.success("Rascunho gravado — continua a preencher.");
      await flushPendingClueImage(data.id);
      void refetchCheckpoints();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao gravar o rascunho"));
    },
  });

  const { mutate: updateCheckpoint, isPending: isUpdatingCheckpoint } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CheckpointForm }) =>
      apiUpdateCheckpoint({ path: { id }, body: toRequestBody(data) as CheckPointUpdate }),
    onSuccess: () => {
      void refetchCheckpoints();
      // editingCheckpoint clears (the form goes back to "create new"), but
      // selectedCheckpointId is deliberately left alone — the details panel
      // stays on this post so activities/media/indicações keep saving
      // without another click on "Editar".
      setEditingCheckpoint(null);
      checkpointForm.reset();
      toast.success("Checkpoint atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar checkpoint"));
    },
  });

  const { mutate: deleteCheckpoint, isPending: isDeletingCheckpoint } = useMutation({
    mutationFn: async (id: number) => apiDeleteCheckpoint({ path: { id } }),
    onSuccess: (_data, id) => {
      void refetchCheckpoints();
      setSelectedCheckpointId((current) => (current === id ? null : current));
      toast.success("Checkpoint deletado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar checkpoint"));
    },
  });

  const { mutate: reorderCheckpoints } = useMutation({
    mutationFn: async (checkpointOrders: Record<number, number>) =>
      apiReorderCheckpoints({ body: checkpointOrders }),
    onSuccess: () => {
      void refetchCheckpoints();
      toast.success("Ordem dos checkpoints atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao reordenar checkpoints"));
    },
  });

  const startEditCheckpoint = (checkpoint: Checkpoint) => {
    setEditingCheckpoint(checkpoint);
    setSelectedCheckpointId(checkpoint.id);
    checkpointForm.setValue("name", checkpoint.name);
    checkpointForm.setValue("description", checkpoint.description ?? "");
    checkpointForm.setValue("latitude", checkpoint.latitude?.toString() || "");
    checkpointForm.setValue("longitude", checkpoint.longitude?.toString() || "");
    checkpointForm.setValue("arrival_radius_m", checkpoint.arrival_radius_m ?? 50);
    checkpointForm.setValue("order", checkpoint.order || 1);
    checkpointForm.setValue("clue", checkpoint.clue ?? "");
    checkpointForm.setValue("clue_media_url", checkpoint.clue_media_url ?? "");
    checkpointForm.setValue("staff_script", checkpoint.staff_script ?? "");
    checkpointForm.setValue("challenge_brief", checkpoint.challenge_brief ?? "");
    checkpointForm.setValue("is_draft", checkpoint.is_draft ?? false);
    checkpointForm.setValue("is_placeholder", checkpoint.is_placeholder ?? false);
    checkpointForm.setValue("stage_id", checkpoint.stage_id ? String(checkpoint.stage_id) : "");
    checkpointForm.setValue("available_from", toLocalInputValue(checkpoint.available_from));
    checkpointForm.setValue("available_until", toLocalInputValue(checkpoint.available_until));
  };

  // Calculate next available order (max order + 1, or 1 if no checkpoints)
  const nextOrder = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) {
      return 1;
    }
    const maxOrder = Math.max(...checkpoints.map((cp) => cp.order || 0));
    return maxOrder + 1;
  }, [checkpoints]);

  // Update order field when creating new checkpoint (not editing)
  const updateOrderForNewCheckpoint = React.useCallback(() => {
    if (!editingCheckpoint) {
      checkpointForm.setValue("order", nextOrder);
    }
  }, [editingCheckpoint, nextOrder, checkpointForm]);

  // Auto-update order when checkpoints change or when not editing
  useEffect(() => {
    updateOrderForNewCheckpoint();
  }, [updateOrderForNewCheckpoint]);

  // Closes the loop started by "Começar a preencher": same PUT as a normal
  // update, but from the admin's perspective this finishes a creation, not
  // an edit — so it clears `pendingDraftId` (not `editingCheckpoint`, which
  // was never set) and talks about "criado", not "atualizado".
  const { mutate: finalizeDraftCheckpoint, isPending: isFinalizingDraft } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CheckpointForm }) =>
      apiUpdateCheckpoint({ path: { id }, body: toRequestBody(data) as CheckPointUpdate }),
    onSuccess: () => {
      void refetchCheckpoints();
      setPendingDraftId(null);
      checkpointForm.reset();
      updateOrderForNewCheckpoint();
      toast.success("Checkpoint criado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar checkpoint"));
    },
  });

  const handleCheckpointSubmit = (data: CheckpointForm) => {
    if (editingCheckpoint) {
      updateCheckpoint({ id: editingCheckpoint.id, data });
    } else if (pendingDraftId) {
      finalizeDraftCheckpoint({ id: pendingDraftId, data });
    } else {
      createCheckpoint(data);
    }
  };

  const startDraftCheckpoint = () => {
    if (!checkpointForm.getValues("name")?.trim()) return;
    startDraftCheckpointMutation(checkpointForm.getValues());
  };

  const cancelEdit = () => {
    if (pendingDraftId) deleteCheckpoint(pendingDraftId);
    setEditingCheckpoint(null);
    setPendingDraftId(null);
    setSelectedCheckpointId(null);
    setPendingClueImage(null);
    checkpointForm.reset();
    updateOrderForNewCheckpoint();
  };

  const handleDragStart = (e: React.DragEvent<HTMLElement>, checkpoint: Checkpoint) => {
    setDraggedCheckpoint(checkpoint);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>, targetCheckpoint: Checkpoint) => {
    e.preventDefault();

    if (!draggedCheckpoint || draggedCheckpoint.id === targetCheckpoint.id) {
      setDraggedCheckpoint(null);
      return;
    }

    const sortedCheckpoints = [...(checkpoints || [])].sort((a, b) => a.order - b.order);
    const draggedIndex = sortedCheckpoints.findIndex((cp) => cp.id === draggedCheckpoint.id);
    const targetIndex = sortedCheckpoints.findIndex((cp) => cp.id === targetCheckpoint.id);

    const reorderedCheckpoints = [...sortedCheckpoints];
    const [draggedItem] = reorderedCheckpoints.splice(draggedIndex, 1);
    if (draggedItem) {
      reorderedCheckpoints.splice(targetIndex, 0, draggedItem);
    }

    const checkpointOrders: Record<number, number> = {};
    reorderedCheckpoints.forEach((cp, index) => {
      checkpointOrders[cp.id] = index + 1;
    });

    reorderCheckpoints(checkpointOrders);
    setDraggedCheckpoint(null);
  };

  const handleDragEnd = () => {
    setDraggedCheckpoint(null);
  };

  const sortedCheckpoints = useMemo(
    () =>
      (checkpoints || [])
        .filter((cp): cp is Checkpoint => cp !== undefined)
        .sort((a, b) => a.order - b.order),
    [checkpoints],
  );

  return {
    checkpointForm,
    editingCheckpoint,
    draggedCheckpoint,
    sortedCheckpoints,
    routeStatus: routeStatus ?? null,
    stages: stages ?? [],
    refetchCheckpoints,
    hasCheckpoints: (checkpoints?.length ?? 0) > 0,
    isCreatingCheckpoint,
    isUpdatingCheckpoint: isUpdatingCheckpoint || isFinalizingDraft,
    isDeletingCheckpoint,
    handleCheckpointSubmit,
    startEditCheckpoint,
    cancelEdit,
    deleteCheckpoint,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    selectedCheckpointId,
    pendingDraftId,
    startDraftCheckpoint,
    isStartingDraft,
    pendingClueImage,
    setPendingClueImage,
  };
}
