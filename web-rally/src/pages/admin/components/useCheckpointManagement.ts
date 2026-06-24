import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckPointService,
  type CheckPointCreate,
  type CheckPointUpdate,
  type DetailedCheckPoint,
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import type { UserState } from "@/stores/useUserStore";
import { getErrorMessage } from "@/utils/errorHandling";

export const checkpointFormSchema = z.object({
  name: z.string().min(1, 'Nome do checkpoint é obrigatório'),
  description: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  order: z.number().min(1, 'Ordem deve ser maior que 0'),
});

export type CheckpointForm = z.infer<typeof checkpointFormSchema>;
export type Checkpoint = DetailedCheckPoint;

function toRequestBody(data: CheckpointForm): CheckPointCreate {
  return {
    name: data.name,
    description: data.description,
    latitude: data.latitude ? Number.parseFloat(data.latitude) : null,
    longitude: data.longitude ? Number.parseFloat(data.longitude) : null,
    order: data.order,
  };
}

export function useCheckpointManagement(userStore: UserState) {
  const toast = useAppToast();
  const [editingCheckpoint, setEditingCheckpoint] = React.useState<Checkpoint | null>(null);
  const [draggedCheckpoint, setDraggedCheckpoint] = React.useState<Checkpoint | null>(null);

  const { data: checkpoints, refetch: refetchCheckpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const data = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return data ?? [];
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
      order: 1,
    },
  });

  const { mutate: createCheckpoint, isPending: isCreatingCheckpoint } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) =>
      CheckPointService.createCheckpointApiRallyV1CheckpointPost(toRequestBody(checkpointData)),
    onSuccess: () => {
      refetchCheckpoints();
      checkpointForm.reset();
      toast.success("Checkpoint criado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar checkpoint"));
    },
  });

  const { mutate: updateCheckpoint, isPending: isUpdatingCheckpoint } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CheckpointForm }) =>
      CheckPointService.updateCheckpointApiRallyV1CheckpointIdPut(id, toRequestBody(data) as CheckPointUpdate),
    onSuccess: () => {
      refetchCheckpoints();
      setEditingCheckpoint(null);
      checkpointForm.reset();
      toast.success("Checkpoint atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar checkpoint"));
    },
  });

  const { mutate: deleteCheckpoint, isPending: isDeletingCheckpoint } = useMutation({
    mutationFn: async (id: number) =>
      CheckPointService.deleteCheckpointApiRallyV1CheckpointIdDelete(id),
    onSuccess: () => {
      refetchCheckpoints();
      toast.success("Checkpoint deletado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar checkpoint"));
    },
  });

  const { mutate: reorderCheckpoints } = useMutation({
    mutationFn: async (checkpointOrders: Record<number, number>) =>
      CheckPointService.reorderCheckpointsApiRallyV1CheckpointReorderPut(checkpointOrders),
    onSuccess: () => {
      refetchCheckpoints();
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
    checkpointForm.setValue("order", checkpoint.order || 1);
  };

  // Calculate next available order (max order + 1, or 1 if no checkpoints)
  const nextOrder = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) {
      return 1;
    }
    const maxOrder = Math.max(...checkpoints.map(cp => cp.order || 0));
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

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, checkpoint: Checkpoint) => {
    setDraggedCheckpoint(checkpoint);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetCheckpoint: Checkpoint) => {
    e.preventDefault();

    if (!draggedCheckpoint || draggedCheckpoint.id === targetCheckpoint.id) {
      setDraggedCheckpoint(null);
      return;
    }

    const sortedCheckpoints = [...(checkpoints || [])].sort((a, b) => a.order - b.order);
    const draggedIndex = sortedCheckpoints.findIndex(cp => cp.id === draggedCheckpoint.id);
    const targetIndex = sortedCheckpoints.findIndex(cp => cp.id === targetCheckpoint.id);

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
