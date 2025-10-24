import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Edit, Trash2, Users, AlertCircle } from 'lucide-react';
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

interface TeamManagementProps {
  userStoreStuff: any;
}

export default function TeamManagement({ userStoreStuff }: TeamManagementProps) {
  const [editingTeam, setEditingTeam] = React.useState<Team | null>(null);

  // Teams queries and mutations
  const { data: teams, refetch: refetchTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await fetch('/api/rally/v1/team/');
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
  });

  const {
    mutate: createTeam,
    isPending: isCreatingTeam,
    error: createTeamError,
    reset: resetCreateTeamError,
  } = useMutation({
    mutationFn: async (teamData: TeamForm) => {
      const response = await fetch('/api/rally/v1/team/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(teamData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create team');
      }
      return response.json();
    },
    onSuccess: () => {
      refetchTeams();
      teamForm.reset();
      resetCreateTeamError();
    },
    onError: (error: any) => {
      console.error('Error creating team:', error);
    },
  });

  const {
    mutate: updateTeam,
    isPending: isUpdatingTeam,
  } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TeamForm }) => {
      const response = await fetch(`/api/rally/v1/team/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update team');
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
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete team');
    },
    onSuccess: () => {
      refetchTeams();
    },
  });

  // Form
  const teamForm = useForm<TeamForm>({
    resolver: zodResolver(teamFormSchema),
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
    resetCreateTeamError();
  };

  const cancelEdit = () => {
    setEditingTeam(null);
    teamForm.reset();
    resetCreateTeamError();
  };

  return (
    <div className="space-y-6">
      {/* Create/Edit Team Form */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
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
      </div>

      {/* Teams List */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
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
              <li
                key={team.id}
                className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)]"
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
                    onClick={() => deleteTeam(team.id)}
                    disabled={isDeletingTeam}
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


