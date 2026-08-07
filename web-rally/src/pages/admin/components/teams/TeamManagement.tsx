import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Trash2, Users, AlertCircle, X, QrCode } from "lucide-react";
import { getErrorMessage } from "@/utils/errorHandling";
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
import { EmptyState } from "@/components/shared";
import {
  getTeams,
  getTeamById,
  createTeam as apiCreateTeam,
  updateTeam as apiUpdateTeam,
  deleteTeam as apiDeleteTeam,
  type TeamCreate,
  type TeamUpdate,
  type DetailedTeam,
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import QRCodeDisplay from "@/components/qr/QRCodeDisplay";

const teamFormSchema = z.object({
  name: z.string().min(1, "Nome da equipa é obrigatório"),
  start_offset_minutes: z
    .number()
    .min(0, "O desfasamento não pode ser negativo")
    .max(24 * 60, "Desfasamento demasiado grande"),
});

type TeamForm = z.infer<typeof teamFormSchema>;

interface Team {
  id: number;
  name: string;
  total: number;
  num_members: number;
  start_offset_minutes?: number;
}

type ExtendedDetailedTeam = Omit<DetailedTeam, "access_code"> & { access_code?: string };

export default function TeamManagement() {
  const navigate = useNavigate();
  const [editingTeam, setEditingTeam] = React.useState<Team | null>(null);
  const [newlyCreatedTeam, setNewlyCreatedTeam] = React.useState<DetailedTeam | null>(null);
  const [selectedTeamForQR, setSelectedTeamForQR] = React.useState<Team | null>(null);
  const queryClient = useQueryClient();
  const toast = useAppToast();

  // Teams queries and mutations
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await getTeams();
      return data;
    },
    staleTime: 0, // Always consider data stale to force refetch
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Fetch team details for QR code display
  const { data: teamDetailsForQR, isLoading: isLoadingQRDetails } = useQuery({
    queryKey: ["teamDetails", selectedTeamForQR?.id],
    queryFn: async () => {
      if (!selectedTeamForQR?.id) return null;
      const { data } = await getTeamById({ path: { id: selectedTeamForQR.id } });
      return data;
    },
    enabled: !!selectedTeamForQR?.id,
  });

  const {
    mutate: createTeam,
    isPending: isCreatingTeam,
    error: createTeamError,
  } = useMutation({
    mutationFn: async (teamData: TeamForm) => {
      const requestBody: TeamCreate = {
        name: teamData.name,
      };
      const { data } = await apiCreateTeam({ body: requestBody });
      return data;
    },
    onSuccess: (data) => {
      // Store the newly created team to show QR code modal
      setNewlyCreatedTeam(data as DetailedTeam);
      // Invalidate and refetch teams data
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      teamForm.reset();
      toast.success("Equipa criada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar equipa"));
    },
  });

  const { mutate: updateTeam, isPending: isUpdatingTeam } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TeamForm }) => {
      const requestBody: TeamUpdate = {
        name: data.name,
        start_offset_minutes: data.start_offset_minutes,
      };
      return apiUpdateTeam({ path: { id }, body: requestBody });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      setEditingTeam(null);
      teamForm.reset();
      toast.success("Equipa atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar equipa"));
    },
  });

  const { mutate: deleteTeam, isPending: isDeletingTeam } = useMutation({
    mutationFn: async (id: number) => {
      return apiDeleteTeam({ path: { id } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Equipa deletada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar equipa"));
    },
  });

  // Form
  const teamForm = useForm<TeamForm>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      start_offset_minutes: 0,
    },
  });

  const handleTeamSubmit = (data: TeamForm) => {
    if (editingTeam) {
      updateTeam({ id: editingTeam.id, data });
    } else {
      createTeam(data);
    }
  };

  const startEditTeam = (team: Team) => {
    setEditingTeam(team);
    teamForm.setValue("name", team.name);
    teamForm.setValue("start_offset_minutes", team.start_offset_minutes ?? 0);
  };

  const cancelEdit = () => {
    setEditingTeam(null);
    teamForm.reset();
  };

  return (
    <div className="space-y-6">
      {/* Create/Edit Team Form */}
      <div className="rally-surface rounded-2xl p-6">
        <h3 className="mb-4 text-lg font-semibold">
          {editingTeam ? "Editar Equipa" : "Criar Nova Equipa"}
        </h3>
        <Form {...teamForm}>
          <form onSubmit={teamForm.handleSubmit(handleTeamSubmit)} className="space-y-4">
            {createTeamError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{createTeamError.message}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={teamForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Equipa</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Equipa Alpha"
                      {...field}
                      className="border-border bg-muted"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {editingTeam && (
              <FormField
                control={teamForm.control}
                name="start_offset_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partida desfasada (minutos)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Ex: 20"
                        {...field}
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value) || 0)}
                        className="border-border bg-muted"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Minutos depois do início do evento a que esta equipa pode arrancar. O percurso
                      é o mesmo para todas — desfasar as partidas evita que se copiem no mesmo
                      posto. 0 = arranca com toda a gente. O fim do evento não muda.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="flex gap-2">
              <BloodyButton type="submit" disabled={isCreatingTeam || isUpdatingTeam}>
                {editingTeam ? "Atualizar" : "Criar"} Equipa
              </BloodyButton>
              {editingTeam && (
                <BloodyButton type="button" variant="neutral" onClick={cancelEdit}>
                  Cancelar
                </BloodyButton>
              )}
            </div>
          </form>
        </Form>
      </div>

      {/* Teams List */}
      <div className="rally-surface rounded-2xl p-6">
        <h3 className="mb-4 text-lg font-semibold">Equipas Existentes</h3>
        {!Array.isArray(teams) || teams.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma equipa criada ainda"
            description="Crie a primeira equipa para começar"
          />
        ) : (
          <ul className="list-none space-y-3">
            {teams.map((team: Team) => (
              <li key={team.id}>
                <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 p-4 sm:p-6">
                  <div>
                    <div className="font-semibold">{team.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Pontuação: {team.total || 0} • Membros: {team.num_members || 0}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <BloodyButton
                      variant="neutral"
                      title="Ver QR code e código de acesso"
                      onClick={() => setSelectedTeamForQR(team)}
                    >
                      <QrCode className="h-4 w-4" />
                    </BloodyButton>
                    <BloodyButton
                      variant="neutral"
                      title="Gerir membros da equipa"
                      onClick={() => navigate({ to: "/team-members" })}
                    >
                      <Users className="h-4 w-4" />
                    </BloodyButton>
                    <BloodyButton variant="neutral" onClick={() => startEditTeam(team)}>
                      <Edit className="h-4 w-4" />
                    </BloodyButton>
                    <BloodyButton
                      variant="neutral"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja deletar esta equipa?")) {
                          deleteTeam(team.id);
                        }
                      }}
                      disabled={isDeletingTeam}
                    >
                      <Trash2 className="h-4 w-4" />
                    </BloodyButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* QR Code Modal */}
      {(newlyCreatedTeam || (selectedTeamForQR && teamDetailsForQR)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="rally-surface w-full max-w-md rounded-2xl">
            <div className="space-y-6 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {newlyCreatedTeam ? "Equipa Criada!" : "Código QR da Equipa"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(newlyCreatedTeam || teamDetailsForQR)?.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewlyCreatedTeam(null);
                    setSelectedTeamForQR(null);
                  }}
                  title="Fechar"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {selectedTeamForQR && isLoadingQRDetails && (
                <div className="flex justify-center p-8">
                  <p className="text-muted-foreground">A carregar QR code...</p>
                </div>
              )}

              {(newlyCreatedTeam || teamDetailsForQR) && (
                <>
                  <div className="flex justify-center">
                    <QRCodeDisplay
                      accessCode={
                        ((newlyCreatedTeam || teamDetailsForQR) as ExtendedDetailedTeam)
                          ?.access_code || ""
                      }
                      size={250}
                    />
                  </div>
                  <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
                    <p className="text-xs text-muted-foreground">
                      Partilhe este código QR ou código de acesso com a equipa para que possam fazer
                      login e acompanhar o progresso.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <BloodyButton
                      onClick={() => {
                        setNewlyCreatedTeam(null);
                        setSelectedTeamForQR(null);
                      }}
                      className="flex-1"
                    >
                      Concluir
                    </BloodyButton>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
