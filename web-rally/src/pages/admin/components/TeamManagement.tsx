import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Users, AlertCircle } from 'lucide-react';
import { useThemedComponents } from '@/components/themes';
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
import { TeamService, type TeamCreate, type TeamUpdate } from '@/client';
import { useAppToast } from '@/hooks/use-toast';

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

import type { UserState } from "@/stores/useUserStore";

interface TeamManagementProps {
  userStore: UserState;
}

export default function TeamManagement({ userStore: _userStore }: TeamManagementProps) {
  const { Card } = useThemedComponents();
  const [editingTeam, setEditingTeam] = React.useState<Team | null>(null);
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
    onSuccess: () => {
      // Invalidate and refetch teams data
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.removeQueries({ queryKey: ['teams'] }); // Force complete refetch
      teamForm.reset();
      toast.success("Equipa criada com sucesso!");
    },
    onError: (error: any) => {
      // Try to extract detailed error message from different error structures
      const errorMessage = error?.body?.detail || 
                          error?.response?.data?.detail || 
                          error?.message || 
                          "Erro ao criar equipa";
      toast.error(errorMessage);
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
    onError: (error: any) => {
      // Try to extract detailed error message from different error structures
      const errorMessage = error?.body?.detail || 
                          error?.response?.data?.detail || 
                          error?.message || 
                          "Erro ao atualizar equipa";
      toast.error(errorMessage);
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
    onError: (error: any) => {
      // Try to extract detailed error message from different error structures
      const errorMessage = error?.body?.detail || 
                          error?.response?.data?.detail || 
                          error?.message || 
                          "Erro ao deletar equipa";
      toast.error(errorMessage);
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
              <Card
                key={team.id}
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
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}



