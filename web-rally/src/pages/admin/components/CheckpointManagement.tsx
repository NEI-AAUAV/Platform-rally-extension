import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Edit, Trash2, MapPin, GripVertical } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { BloodyButton } from '@/components/themes/bloody';
import { EmptyState } from '@/components/shared';

const checkpointFormSchema = z.object({
  name: z.string().min(1, 'Nome do checkpoint é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  order: z.number().min(1, 'Ordem deve ser maior que 0'),
});

type CheckpointForm = z.infer<typeof checkpointFormSchema>;

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
  order: number;
}

import type { UserState } from "@/stores/useUserStore";

interface CheckpointManagementProps {
  userStore: UserState;
}

export default function CheckpointManagement({ userStore }: CheckpointManagementProps) {
  const [editingCheckpoint, setEditingCheckpoint] = React.useState<Checkpoint | null>(null);
  const [draggedCheckpoint, setDraggedCheckpoint] = React.useState<Checkpoint | null>(null);

  // Checkpoints queries and mutations
  const { data: checkpoints, refetch: refetchCheckpoints } = useQuery<Checkpoint[]>({
    queryKey: ['checkpoints'],
    queryFn: async (): Promise<Checkpoint[]> => {
      const response = await fetch('/api/rally/v1/checkpoint/', {
        headers: {
          Authorization: `Bearer ${userStore.token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch checkpoints');
      const data = await response.json();
      return Array.isArray(data) ? (data as Checkpoint[]) : [];
    },
    enabled: !!userStore.token,
  });

  const {
    mutate: createCheckpoint,
    isPending: isCreatingCheckpoint,
  } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) => {
      const response = await fetch('/api/rally/v1/checkpoint/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStore.token}`,
        },
        body: JSON.stringify({
          ...checkpointData,
          latitude: checkpointData.latitude ? parseFloat(checkpointData.latitude) : null,
          longitude: checkpointData.longitude ? parseFloat(checkpointData.longitude) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to create checkpoint');
      return response.json();
    },
    onSuccess: () => {
      refetchCheckpoints();
      checkpointForm.reset();
    },
  });

  const {
    mutate: updateCheckpoint,
    isPending: isUpdatingCheckpoint,
  } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CheckpointForm }) => {
      const response = await fetch(`/api/rally/v1/checkpoint/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStore.token}`,
        },
        body: JSON.stringify({
          ...data,
          latitude: data.latitude ? parseFloat(data.latitude) : null,
          longitude: data.longitude ? parseFloat(data.longitude) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to update checkpoint');
      return response.json();
    },
    onSuccess: () => {
      refetchCheckpoints();
      setEditingCheckpoint(null);
      checkpointForm.reset();
    },
  });

  const {
    mutate: deleteCheckpoint,
    isPending: isDeletingCheckpoint,
  } = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/rally/v1/checkpoint/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userStore.token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete checkpoint');
    },
    onSuccess: () => {
      refetchCheckpoints();
    },
  });

  const { mutate: reorderCheckpoints } = useMutation({
    mutationFn: async (checkpointOrders: Record<number, number>) => {
      const response = await fetch('/api/rally/v1/checkpoint/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStore.token}`,
        },
        body: JSON.stringify(checkpointOrders),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { detail?: string };
        throw new Error(errorData.detail || 'Failed to reorder checkpoints');
      }
      
      return response.json();
    },
    onSuccess: () => {
      refetchCheckpoints();
    },
    onError: (error: Error) => {
      alert(`Erro ao reordenar checkpoints: ${error.message || error.toString()}`);
    },
  });

  // Form
  const checkpointForm = useForm({
    resolver: zodResolver(checkpointFormSchema),
    defaultValues: {
      name: '',
      description: '',
      latitude: '',
      longitude: '',
      order: 1,
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
    checkpointForm.setValue('name', checkpoint.name);
    checkpointForm.setValue('description', checkpoint.description);
    checkpointForm.setValue('latitude', checkpoint.latitude?.toString() || '');
    checkpointForm.setValue('longitude', checkpoint.longitude?.toString() || '');
    checkpointForm.setValue('order', checkpoint.order || 1);
  };

  const cancelEdit = () => {
    setEditingCheckpoint(null);
    checkpointForm.reset();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, checkpoint: Checkpoint) => {
    setDraggedCheckpoint(checkpoint);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetCheckpoint: Checkpoint) => {
    e.preventDefault();
    
    if (!draggedCheckpoint || draggedCheckpoint.id === targetCheckpoint.id) {
      setDraggedCheckpoint(null);
      return;
    }

    // Create new order mapping
    const checkpointOrders: Record<number, number> = {};
    
    // Sort checkpoints by current order
    const sortedCheckpoints = [...(checkpoints || [])].sort((a, b) => a.order - b.order);
    
    // Find indices
    const draggedIndex = sortedCheckpoints.findIndex(cp => cp.id === draggedCheckpoint.id);
    const targetIndex = sortedCheckpoints.findIndex(cp => cp.id === targetCheckpoint.id);
    
    // Reorder array
    const reorderedCheckpoints = [...sortedCheckpoints];
    const [draggedItem] = reorderedCheckpoints.splice(draggedIndex, 1);
    reorderedCheckpoints.splice(targetIndex, 0, draggedItem);
    
    // Create order mapping
    reorderedCheckpoints.forEach((cp, index) => {
      checkpointOrders[cp.id] = index + 1;
    });
    
    // Send reorder request
    reorderCheckpoints(checkpointOrders);
    setDraggedCheckpoint(null);
  };

  const handleDragEnd = () => {
    setDraggedCheckpoint(null);
  };

  return (
    <div className="space-y-6">
      {/* Create/Edit Checkpoint Form */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
        <h3 className="text-lg font-semibold mb-4">
          {editingCheckpoint ? 'Editar Checkpoint' : 'Criar Novo Checkpoint'}
        </h3>
        <Form {...checkpointForm}>
          <form onSubmit={checkpointForm.handleSubmit(handleCheckpointSubmit)} className="space-y-4">
            <FormField
              control={checkpointForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Checkpoint</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Checkpoint Central"
                      {...field}
                      className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={checkpointForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Descrição do checkpoint..."
                      {...field}
                      className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={checkpointForm.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: 40.6405"
                        {...field}
                        className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={checkpointForm.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: -8.6538"
                        {...field}
                        className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={checkpointForm.control}
              name="order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordem do Checkpoint</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ex: 1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <BloodyButton
                type="submit"
                disabled={isCreatingCheckpoint || isUpdatingCheckpoint}
              >
                {editingCheckpoint ? 'Atualizar' : 'Criar'} Checkpoint
              </BloodyButton>
              {editingCheckpoint && (
                <BloodyButton
                  type="button"
                  variant="neutral"
                  onClick={cancelEdit}
                >
                  Cancelar
                </BloodyButton>
              )}
            </div>
          </form>
        </Form>
      </div>

      {/* Checkpoints List */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Checkpoints Existentes</h3>
          <p className="text-sm text-[rgb(255,255,255,0.6)]">
            Arraste pelos ícones <GripVertical className="w-3 h-3 inline mx-1" /> para reordenar
          </p>
        </div>
        {checkpoints?.length === 0 ? (
          <EmptyState
            icon={<MapPin className="w-8 h-8 text-[rgb(255,255,255,0.5)]" />}
            title="Nenhum checkpoint criado ainda"
            description="Crie o primeiro checkpoint para começar"
          />
        ) : (
          <ul className="space-y-3 list-none">
            {checkpoints?.sort((a: Checkpoint, b: Checkpoint) => a.order - b.order).map((checkpoint: Checkpoint) => (
              <li
                key={checkpoint.id}
                draggable
                aria-label={`Checkpoint ${checkpoint.name}, ordem ${checkpoint.order}`}
                onDragStart={(e) => handleDragStart(e, checkpoint)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, checkpoint)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    // Focus management for keyboard users
                  }
                }}
                className={`flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)] cursor-move transition-all ${
                  draggedCheckpoint?.id === checkpoint.id ? 'opacity-50 scale-95' : 'hover:bg-[rgb(255,255,255,0.04)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center text-[rgb(255,255,255,0.5)]">
                    <GripVertical className="w-4 h-4" />
                    <span className="text-xs font-mono">{checkpoint.order}</span>
                  </div>
                  <div>
                    <div className="font-semibold">{checkpoint.name}</div>
                    <div className="text-sm text-[rgb(255,255,255,0.7)]">
                      {checkpoint.description}
                    </div>
                    {(checkpoint.latitude || checkpoint.longitude) && (
                      <div className="text-xs text-[rgb(255,255,255,0.5)]">
                        📍 {checkpoint.latitude}, {checkpoint.longitude}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <BloodyButton
                    variant="neutral"
                    onClick={() => startEditCheckpoint(checkpoint)}
                  >
                    <Edit className="w-4 h-4" />
                  </BloodyButton>
                  <BloodyButton
                    variant="neutral"
                    onClick={() => deleteCheckpoint(checkpoint.id)}
                    disabled={isDeletingCheckpoint}
                  >
                    <Trash2 className="w-4 h-4" />
                  </BloodyButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
