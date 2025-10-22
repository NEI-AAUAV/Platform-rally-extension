import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Edit, Trash2, Users, MapPin, GripVertical, AlertCircle } from "lucide-react";
import useUser from "@/hooks/useUser";

// Team form schema
const teamFormSchema = z.object({
  name: z.string().min(1, "Nome da equipa é obrigatório"),
});

// Checkpoint form schema
const checkpointFormSchema = z.object({
  name: z.string().min(1, "Nome do checkpoint é obrigatório"),
  description: z.string().min(1, "Descrição é obrigatória"),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  order: z.number().min(1, "Ordem deve ser maior que 0"),
});

type TeamForm = z.infer<typeof teamFormSchema>;
type CheckpointForm = z.infer<typeof checkpointFormSchema>;

export default function Admin() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [activeTab, setActiveTab] = useState<"teams" | "checkpoints">("teams");
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingCheckpoint, setEditingCheckpoint] = useState<any>(null);
  const [draggedCheckpoint, setDraggedCheckpoint] = useState<any>(null);

  // Teams queries and mutations
  const { data: teams, refetch: refetchTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/team/");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: isManager,
  });

  const {
    mutate: createTeam,
    isPending: isCreatingTeam,
    error: createTeamError,
    reset: resetCreateTeamError,
  } = useMutation({
    mutationFn: async (teamData: TeamForm) => {
      const response = await fetch("/api/rally/v1/team/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(teamData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create team");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchTeams();
      teamForm.reset();
      resetCreateTeamError();
    },
    onError: (error: any) => {
      console.error("Error creating team:", error);
    },
  });

  const {
    mutate: updateTeam,
    isPending: isUpdatingTeam,
  } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TeamForm }) => {
      const response = await fetch(`/api/rally/v1/team/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update team");
      return response.json();
    },
    onSuccess: () => {
      refetchTeams();
      setEditingTeam(null);
      teamForm.reset();
    },
  });

  const {
    mutate: deleteTeam,
    isPending: isDeletingTeam,
  } = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/rally/v1/team/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      refetchTeams();
    },
  });

  // Checkpoints queries and mutations
  const { data: checkpoints, refetch: refetchCheckpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/checkpoint/");
      if (!response.ok) throw new Error("Failed to fetch checkpoints");
      return response.json();
    },
    enabled: isManager,
  });

  const {
    mutate: createCheckpoint,
    isPending: isCreatingCheckpoint,
  } = useMutation({
    mutationFn: async (checkpointData: CheckpointForm) => {
      const response = await fetch("/api/rally/v1/checkpoint/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify({
          ...checkpointData,
          latitude: checkpointData.latitude ? parseFloat(checkpointData.latitude) : null,
          longitude: checkpointData.longitude ? parseFloat(checkpointData.longitude) : null,
        }),
      });
      if (!response.ok) throw new Error("Failed to create checkpoint");
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify({
          ...data,
          latitude: data.latitude ? parseFloat(data.latitude) : null,
          longitude: data.longitude ? parseFloat(data.longitude) : null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update checkpoint");
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
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete checkpoint");
    },
    onSuccess: () => {
      refetchCheckpoints();
    },
  });

  const { mutate: reorderCheckpoints } = useMutation({
    mutationFn: async (checkpointOrders: Record<number, number>) => {
      const response = await fetch("/api/rally/v1/checkpoint/reorder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(checkpointOrders),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Reorder error response:", errorData);
        throw new Error(errorData.detail || "Failed to reorder checkpoints");
      }
      
      return response.json();
    },
    onSuccess: () => {
      refetchCheckpoints();
    },
    onError: (error: Error) => {
      console.error("Failed to reorder checkpoints:", error);
      alert(`Erro ao reordenar checkpoints: ${error.message || error.toString()}`);
    },
  });

  // Forms
  const teamForm = useForm<TeamForm>({
    resolver: zodResolver(teamFormSchema),
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

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  const handleTeamSubmit = (data: TeamForm) => {
    if (editingTeam) {
      updateTeam({ id: editingTeam.id, data });
    } else {
      createTeam(data);
    }
  };

  const handleCheckpointSubmit = (data: CheckpointForm) => {
    if (editingCheckpoint) {
      updateCheckpoint({ id: editingCheckpoint.id, data });
    } else {
      createCheckpoint(data);
    }
  };

  const startEditTeam = (team: any) => {
    setEditingTeam(team);
    teamForm.setValue("name", team.name);
    resetCreateTeamError();
  };

  const startEditCheckpoint = (checkpoint: any) => {
    setEditingCheckpoint(checkpoint);
    checkpointForm.setValue("name", checkpoint.name);
    checkpointForm.setValue("description", checkpoint.description);
    checkpointForm.setValue("latitude", checkpoint.latitude?.toString() || "");
    checkpointForm.setValue("longitude", checkpoint.longitude?.toString() || "");
    checkpointForm.setValue("order", checkpoint.order || 1);
  };

  const cancelEdit = () => {
    setEditingTeam(null);
    setEditingCheckpoint(null);
    teamForm.reset();
    checkpointForm.reset();
    resetCreateTeamError();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, checkpoint: any) => {
    setDraggedCheckpoint(checkpoint);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetCheckpoint: any) => {
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
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Gestão Administrativa</h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Criar e editar equipas e checkpoints do Rally
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center gap-4">
        <BloodyButton
          blood={activeTab === "teams"}
          variant={activeTab === "teams" ? "default" : "neutral"}
          onClick={() => setActiveTab("teams")}
        >
          <Users className="w-4 h-4 mr-2" />
          Equipas
        </BloodyButton>
        <BloodyButton
          blood={activeTab === "checkpoints"}
          variant={activeTab === "checkpoints" ? "default" : "neutral"}
          onClick={() => setActiveTab("checkpoints")}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Checkpoints
        </BloodyButton>
      </div>

      {/* Teams Tab */}
      {activeTab === "teams" && (
        <div className="space-y-6">
          {/* Create/Edit Team Form */}
          <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
            <h3 className="text-lg font-semibold mb-4">
              {editingTeam ? "Editar Equipa" : "Criar Nova Equipa"}
            </h3>
            <Form {...teamForm}>
              <form onSubmit={teamForm.handleSubmit(handleTeamSubmit)} className="space-y-4">
                {createTeamError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {createTeamError.message}
                    </AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={teamForm.control}
                  name="name"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Nome da Equipa</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Equipa Alpha"
                          {...field}
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
                    disabled={isCreatingTeam || isUpdatingTeam}
                  >
                    {editingTeam ? "Atualizar" : "Criar"} Equipa
                  </BloodyButton>
                  {editingTeam && (
                    <BloodyButton
                      type="button"
                      variant="neutral"
                      onClick={cancelEdit}
                    >
                      Cancelar
                    </BloodyButton>
                  )}
                </ul>
              </form>
            </Form>
          </div>

          {/* Teams List */}
          <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
            <h3 className="text-lg font-semibold mb-4">Equipas Existentes</h3>
            {teams?.length === 0 ? (
              <p className="text-[rgb(255,255,255,0.7)] text-center py-8">
                Nenhuma equipa criada ainda.
              </p>
            ) : (
              <ul className="space-y-3 list-none">
                {teams?.map((team: any) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)]"
                  >
                    <div>
                      <div className="font-semibold">{team.name}</div>
                      <div className="text-sm text-[rgb(255,255,255,0.7)]">
                        Pontuação: {team.total || 0} • Membros: {team.num_members || 0}
                      </li>
                    </li>
                    <div className="flex gap-2">
                      <BloodyButton
                        variant="neutral"
                        size="sm"
                        onClick={() => startEditTeam(team)}
                      >
                        <Edit className="w-4 h-4" />
                      </BloodyButton>
                      <BloodyButton
                        variant="neutral"
                        size="sm"
                        onClick={() => deleteTeam(team.id)}
                        disabled={isDeletingTeam}
                      >
                        <Trash2 className="w-4 h-4" />
                      </BloodyButton>
                    </li>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Checkpoints Tab */}
      {activeTab === "checkpoints" && (
        <div className="space-y-6">
          {/* Create/Edit Checkpoint Form */}
          <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
            <h3 className="text-lg font-semibold mb-4">
              {editingCheckpoint ? "Editar Checkpoint" : "Criar Novo Checkpoint"}
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
                </ul>
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
                    {editingCheckpoint ? "Atualizar" : "Criar"} Checkpoint
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
                </ul>
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
              <p className="text-[rgb(255,255,255,0.7)] text-center py-8">
                Nenhum checkpoint criado ainda.
              </p>
            ) : (
              <ul className="space-y-3 list-none">
                {checkpoints?.sort((a, b) => a.order - b.order).map((checkpoint: any) => (
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
                        console.log('Keyboard interaction with checkpoint:', checkpoint.name);
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
                      </li>
                      <div>
                        <div className="font-semibold">{checkpoint.name}</div>
                        <div className="text-sm text-[rgb(255,255,255,0.7)]">
                          {checkpoint.description}
                        </li>
                        {(checkpoint.latitude || checkpoint.longitude) && (
                          <div className="text-xs text-[rgb(255,255,255,0.5)]">
                            📍 {checkpoint.latitude}, {checkpoint.longitude}
                          </li>
                        )}
                      </li>
                    </li>
                    <div className="flex gap-2">
                      <BloodyButton
                        variant="neutral"
                        size="sm"
                        onClick={() => startEditCheckpoint(checkpoint)}
                      >
                        <Edit className="w-4 h-4" />
                      </BloodyButton>
                      <BloodyButton
                        variant="neutral"
                        size="sm"
                        onClick={() => deleteCheckpoint(checkpoint.id)}
                        disabled={isDeletingCheckpoint}
                      >
                        <Trash2 className="w-4 h-4" />
                      </BloodyButton>
                    </li>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}