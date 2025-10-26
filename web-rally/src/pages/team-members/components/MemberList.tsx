import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2 } from "lucide-react";

interface TeamMember {
  id: number;
  name: string;
  email?: string;
  is_captain: boolean;
}

interface MemberListProps {
  teamMembers: TeamMember[] | undefined;
  selectedTeam: string;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}

export default function MemberList({ teamMembers, selectedTeam, userToken, onSuccess, className = "" }: MemberListProps) {
  // Remove member mutation
  const {
    mutate: removeMember,
    isPending: isRemovingMember,
  } = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to remove member");
      }
      return response.json();
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleRemoveMember = (userId: number) => {
    if (!selectedTeam) return;
    removeMember(userId);
  };

  return (
    <Card className={className}>
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
  );
}






