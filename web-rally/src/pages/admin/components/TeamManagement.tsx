import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Users, AlertCircle, X, QrCode } from 'lucide-react';
import { useThemedComponents } from '@/components/themes';
import { getErrorMessage } from '@/utils/errorHandling';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared';
import { TeamService, type TeamCreate, type TeamUpdate, type DetailedTeam } from '@/client';
import { useAppToast } from '@/hooks/use-toast';
import QRCodeDisplay from '@/components/QRCodeDisplay';

const teamFormSchema = z.object({
  name: z.string().min(1, 'Nome da equipa é obrigatório'),
});

type TeamForm = z.infer<typeof teamFormSchema>;

interface Team {
  id: number;
  name: string;
  total: number;
  num_members: number;
}

type ExtendedDetailedTeam = Omit<DetailedTeam, 'access_code'> & { access_code?: string };



export default function TeamManagement() {
  const navigate = useNavigate();
  const { Card } = useThemedComponents();
  const [editingTeam, setEditingTeam] = React.useState<Team | null>(null);
  const [newlyCreatedTeam, setNewlyCreatedTeam] = React.useState<DetailedTeam | null>(null);
  const [selectedTeamForQR, setSelectedTeamForQR] = React.useState<Team | null>(null);
  const queryClient = useQueryClient();
  const toast = useAppToast();

  // Teams queries and mutations
  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
    staleTime: 0, // Always consider data stale to force refetch
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Fetch team details for QR code display
  const { data: teamDetailsForQR, isLoading: isLoadingQRDetails } = useQuery({
    queryKey: ['teamDetails', selectedTeamForQR?.id],
    queryFn: () => {
      if (!selectedTeamForQR?.id) return null;
      return TeamService.getTeamByIdApiRallyV1TeamIdGet(selectedTeamForQR.id);
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
      return TeamService.createTeamApiRallyV1TeamPost(requestBody);
    },
    onSuccess: (data) => {
      // Store the newly created team to show QR code modal
      setNewlyCreatedTeam(data as DetailedTeam);
      // Invalidate and refetch teams data
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      teamForm.reset();
      toast.success("Equipa criada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar equipa"));
    },
  });

  const {
    mutate: updateTeam,
    isPending: isUpdatingTeam,
  } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TeamForm }) => {
      const requestBody: TeamUpdate = {
        name: data.name,
      };
      return TeamService.updateTeamApiRallyV1TeamIdPut(id, requestBody);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setEditingTeam(null);
      teamForm.reset();
      toast.success("Equipa atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar equipa"));
    },
  });

  const {
    mutate: deleteTeam,
    isPending: isDeletingTeam,
  } = useMutation({
    mutationFn: async (id: number) => {
      return TeamService.deleteTeamApiRallyV1TeamIdDelete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
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
    teamForm.setValue('name', team.name);
  };

  const cancelEdit = () => {
    setEditingTeam(null);
    teamForm.reset();
  };

  return (
    <div className="space-y-6">
      {/* Create/Edit Team Form */}
      <Card variant="default" padding="lg" rounded="2xl">
        <h3 className="text-lg font-semibold mb-4">
          {editingTeam ? 'Editar Equipa' : 'Criar Nova Equipa'}
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
              render={({ field }) => (
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
                {editingTeam ? 'Atualizar' : 'Criar'} Equipa
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
            </div>
          </form>
        </Form>
      </Card>

      {/* Teams List */}
      <Card variant="default" padding="lg" rounded="2xl">
        <h3 className="text-lg font-semibold mb-4">Equipas Existentes</h3>
        {teams?.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8 text-[rgb(255,255,255,0.5)]" />}
            title="Nenhuma equipa criada ainda"
            description="Crie a primeira equipa para começar"
          />
        ) : (
          <ul className="space-y-3 list-none">
            {teams?.map((team: Team) => (
              <li key={team.id}>
                <Card
                  variant="subtle"
                  padding="md"
                  rounded="xl"
                  className="flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{team.name}</div>
                    <div className="text-sm text-[rgb(255,255,255,0.7)]">
                      Pontuação: {team.total || 0} • Membros: {team.num_members || 0}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <BloodyButton
                      variant="neutral"
                      title="Ver QR code e código de acesso"
                      onClick={() => setSelectedTeamForQR(team)}
                    >
                      <QrCode className="w-4 h-4" />
                    </BloodyButton>
                    <BloodyButton
                      variant="neutral"
                      title="Gerir membros da equipa"
                      onClick={() => navigate(`/team-members?adminTeamId=${team.id}`)}
                    >
                      <Users className="w-4 h-4" />
                    </BloodyButton>
                    <BloodyButton
                      variant="neutral"
                      onClick={() => startEditTeam(team)}
                    >
                      <Edit className="w-4 h-4" />
                    </BloodyButton>
                    <BloodyButton
                      variant="neutral"
                      onClick={() => {
                        if (confirm('Tem certeza que deseja deletar esta equipa?')) {
                          deleteTeam(team.id);
                        }
                      }}
                      disabled={isDeletingTeam}
                    >
                      <Trash2 className="w-4 h-4" />
                    </BloodyButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* QR Code Modal for Newly Created Team or Selected Team */}
      {(newlyCreatedTeam || (selectedTeamForQR && teamDetailsForQR)) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-[rgb(20,20,25)] border-white/20">
            <div className="p-8 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {newlyCreatedTeam ? 'Equipa Criada!' : 'Código QR da Equipa'}
                  </h2>
                  <p className="text-white/70 text-sm mt-1">
                    {(newlyCreatedTeam || teamDetailsForQR)?.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setNewlyCreatedTeam(null);
                    setSelectedTeamForQR(null);
                  }}
                  title="Fechar"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Loading State */}
              {selectedTeamForQR && isLoadingQRDetails && (
                <div className="flex justify-center p-8">
                  <p className="text-white/70">A carregar QR code...</p>
                </div>
              )}

              {/* QR Code */}
              {(newlyCreatedTeam || teamDetailsForQR) && (
                <>
                  <div className="flex justify-center">
                    <QRCodeDisplay
                      accessCode={((newlyCreatedTeam || teamDetailsForQR) as ExtendedDetailedTeam)?.access_code || ''}
                      size={250}
                    />
                  </div>

                  {/* Instructions */}
                  <div className="space-y-3 bg-white/5 p-4 rounded-lg border border-white/10">
                    <p className="text-white text-sm">
                      <strong>Código de Acesso:</strong> {((newlyCreatedTeam || teamDetailsForQR) as ExtendedDetailedTeam)?.access_code}
                    </p>
                    <p className="text-white/70 text-xs">
                      Partilhe este código QR ou código de acesso com a equipa para que possam fazer login e acompanhar o progresso.
                    </p>
                  </div>

                  {/* Buttons */}
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
          </Card>
        </div>
      )}
    </div>
  );
}



