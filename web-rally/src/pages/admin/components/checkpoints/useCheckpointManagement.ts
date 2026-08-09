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

  const { mutate: createCheckpoint, isPending: isCreatingCheckpoint } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) =>
      apiCreateCheckpoint({ body: toRequestBody(checkpointData) }),
    onSuccess: () => {
      void refetchCheckpoints();
      checkpointForm.reset();
      toast.success("Checkpoint criado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar checkpoint"));
    },
  });

  const { mutate: updateCheckpoint, isPending: isUpdatingCheckpoint } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CheckpointForm }) =>
      apiUpdateCheckpoint({ path: { id }, body: toRequestBody(data) as CheckPointUpdate }),
    onSuccess: () => {
      void refetchCheckpoints();
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
    onSuccess: () => {
      void refetchCheckpoints();
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

  const handleCheckpointSubmit = (data: CheckpointForm) => {
    if (editingCheckpoint) {
      updateCheckpoint({ id: editingCheckpoint.id, data });
    } else {
      createCheckpoint(data);
    }
  };

  const startEditCheckpoint = (checkpoint: Checkpoint) => {
    setEditingCheckpoint(checkpoint);
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

  const cancelEdit = () => {
    setEditingCheckpoint(null);
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
  };
}
