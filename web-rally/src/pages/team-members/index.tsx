import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Plus, Trash2, UserPlus, AlertCircle } from "lucide-react";
import useUser from "@/hooks/useUser";
import { Navigate } from "react-router-dom";

const addMemberSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  is_captain: z.boolean().default(false),
});

type AddMemberForm = z.infer<typeof addMemberSchema>;

interface Team {
  id: number;
  name: string;
  total: number;
  classification: number;
}

interface TeamMember {
  id: number;
  name: string;
  email?: string;
  is_captain: boolean;
}

export default function TeamMembers() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Form setup
  const form = useForm<AddMemberForm>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      name: "",
      email: "",
      is_captain: false,
    },
  });

  // Fetch teams
  const { data: teams, refetch: refetchTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/team/");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
  });

  // Fetch team members
  const { data: teamMembers, refetch: refetchTeamMembers } = useQuery({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members`, {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch team members");
      return response.json() as Promise<TeamMember[]>;
    },
    enabled: !!selectedTeam && isManager,
  });

  // Add member mutation
  const {
    mutate: addMember,
    isPending: isAddingMember,
    error: addError,
  } = useMutation({
    mutationFn: async (memberData: AddMemberForm) => {
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify({
          ...memberData,
          email: memberData.email || null,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to add member");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchTeamMembers();
      form.reset();
    },
    onError: (error: any) => {
      console.error("Error adding member:", error);
      console.log("Error details:", error.message);
    },
  });

  // Remove member mutation
  const {
    mutate: removeMember,
    isPending: isRemovingMember,
  } = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to remove member");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchTeamMembers();
    },
  });

  const handleAddMember = (data: AddMemberForm) => {
    if (!selectedTeam) return;
    addMember(data);
  };

  const handleRemoveMember = (userId: number) => {
    if (!selectedTeam) return;
    removeMember(userId);
  };

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Users className="w-6 h-6" />
          Gestão de Membros das Equipas
        </h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Adicionar e remover membros das equipas do Rally
        </p>
      </div>

      {/* Team Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Equipa</CardTitle>
          <CardDescription>
            Escolha uma equipa para gerir os seus membros
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="team-select">Equipa</Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar equipa" />
              </SelectTrigger>
              <SelectContent>
                {teams?.map((team: Team) => (
                  <SelectItem key={team.id} value={team.id.toString()}>
                    {team.name} ({team.total} pontos)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedTeam && (
        <>
          {/* Add Member */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Adicionar Membro
              </CardTitle>
              <CardDescription>
                Adicionar um novo membro à equipa selecionada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(handleAddMember)} className="space-y-4">
                {addError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {addError.message}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      {...form.register("name")}
                      placeholder="Nome do membro"
                    />
                    {form.formState.errors.name && (
                      <p className="text-red-400 text-sm">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (opcional)</Label>
                    <Input
                      id="email"
                      type="email"
                      {...form.register("email")}
                      placeholder="email@exemplo.com"
                    />
                    {form.formState.errors.email && (
                      <p className="text-red-400 text-sm">{form.formState.errors.email.message}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between rounded-lg border border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.02)] p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_captain" className="text-base">
                      Capitão da Equipa
                    </Label>
                    <p className="text-sm text-[rgb(255,255,255,0.7)]">
                      Marcar este membro como capitão da equipa
                    </p>
                  </div>
                  <Switch
                    id="is_captain"
                    checked={form.watch("is_captain")}
                    onCheckedChange={(checked) => form.setValue("is_captain", checked)}
                  />
                </div>
                
                <div className="flex justify-center">
                  <Button
                    type="submit"
                    disabled={isAddingMember}
                    className="min-w-[200px]"
                  >
                    {isAddingMember ? "A Adicionar..." : "Adicionar Membro"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Team Members List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Membros da Equipa
              </CardTitle>
              <CardDescription>
                Lista de membros da equipa selecionada
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers?.length === 0 ? (
                <div className="text-center py-8 text-[rgb(255,255,255,0.7)]">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Esta equipa não tem membros ainda.</p>
                  <p className="text-sm mt-2">Adicione o primeiro membro usando o formulário acima.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.04)] rounded-lg border border-[rgb(255,255,255,0.15)]"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-blue-600/20 text-blue-300 border-blue-500">
                          ID: {member.id}
                        </Badge>
                        {member.is_captain && (
                          <Badge variant="outline" className="bg-yellow-600/20 text-yellow-300 border-yellow-500">
                            Capitão
                          </Badge>
                        )}
                        <div>
                          <div className="font-medium">{member.name}</div>
                          {member.email && (
                            <div className="text-sm text-[rgb(255,255,255,0.6)]">
                              {member.email}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={isRemovingMember}
                        className="text-red-400 hover:text-red-300 hover:bg-red-600/20"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
