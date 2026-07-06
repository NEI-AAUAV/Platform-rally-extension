import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, Link2 } from "lucide-react";
import { TeamMembersService } from "@/client";
import LinkMemberPanel from "./LinkMemberPanel";

interface TeamMember {
  id: number;
  name: string;
  email?: string;
  is_captain: boolean;
  is_linked?: boolean;
}

type MemberListProps = Readonly<{
  teamMembers: TeamMember[] | undefined;
  selectedTeam: string;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}>;

export default function MemberList({
  teamMembers,
  selectedTeam,
  onSuccess,
  className = "",
}: MemberListProps) {
  const [linkingId, setLinkingId] = useState<number | null>(null);
  // Remove member mutation
  const { mutate: removeMember, isPending: isRemovingMember } = useMutation({
    mutationFn: async (userId: number) => {
      return TeamMembersService.removeTeamMemberApiRallyV1TeamTeamIdMembersUserIdDelete(
        Number.parseInt(selectedTeam),
        userId,
      );
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
          <Users className="h-5 w-5" />
          Membros da Equipa
        </CardTitle>
        <CardDescription>Lista de membros da equipa selecionada</CardDescription>
      </CardHeader>
      <CardContent>
        {teamMembers?.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Esta equipa não tem membros ainda.</p>
            <p className="mt-2 text-sm">Adicione o primeiro membro usando o formulário acima.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamMembers?.map((member) => (
              <div
                key={member.id}
                className="rounded-xl border border-border bg-card/60 p-3 transition-colors hover:bg-accent sm:p-4"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-blue-500 bg-blue-600/20 text-blue-300">
                    ID: {member.id}
                  </Badge>
                  {member.is_captain && (
                    <Badge
                      variant="outline"
                      className="border-yellow-500 bg-yellow-600/20 text-yellow-300"
                    >
                      Capitão
                    </Badge>
                  )}
                  <div>
                    <div className="font-medium">{member.name}</div>
                    {member.email && (
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {member.is_linked ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500 bg-emerald-600/20 text-emerald-300"
                    >
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Conta NEI associada
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLinkingId((id) => (id === member.id ? null : member.id))}
                      className="text-blue-400 hover:bg-blue-600/20 hover:text-blue-300"
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      {linkingId === member.id ? "Cancelar" : "Ligar conta NEI"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={isRemovingMember}
                    className="text-red-400 hover:bg-red-600/20 hover:text-red-300"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </div>

                {linkingId === member.id && (
                  <LinkMemberPanel
                    teamId={Number.parseInt(selectedTeam)}
                    placeholderUserId={member.id}
                    onLinked={() => {
                      setLinkingId(null);
                      onSuccess();
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
