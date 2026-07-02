import { useEffect, useState } from "react";
import { Users, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import useTeamAuth from "@/hooks/useTeamAuth";
import useStaffLogin from "@/hooks/useLoginLink";
import { useAppToast } from "@/hooks/use-toast";
import { TeamMemberLinkService } from "@/services/TeamMemberLinkService";
import { useAuth } from "react-oidc-context";
import { LoadingState } from "@/components/shared";

const PENDING_LINK_MEMBER_KEY = "rally_pending_link_user_id";
const PENDING_LINK_TEAM_KEY = "rally_pending_link_team_id";

export default function TeamInfo() {
  const { team, teamData, isLoading } = useTeamAuth();
  const onStaffLogin = useStaffLogin();
  const toast = useAppToast();
  const oidcAuth = useAuth();
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const linkNow = async (teamId: number, memberId: number) => {
    setLinkingId(memberId);
    try {
      await TeamMemberLinkService.linkSelf(teamId, memberId);
      toast.success("Conta NEI associada com sucesso!");
      sessionStorage.removeItem(PENDING_LINK_MEMBER_KEY);
      sessionStorage.removeItem(PENDING_LINK_TEAM_KEY);
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível associar a conta";
      toast.error(message);
    } finally {
      setLinkingId(null);
    }
  };

  // Resume a link started before the OIDC redirect: if we're now authenticated
  // and a pending target member is stored, finish the link automatically.
  useEffect(() => {
    if (!oidcAuth.isAuthenticated) return;
    const pendingMember = sessionStorage.getItem(PENDING_LINK_MEMBER_KEY);
    const pendingTeam = sessionStorage.getItem(PENDING_LINK_TEAM_KEY);
    if (!pendingMember || !pendingTeam) return;
    void linkNow(Number(pendingTeam), Number(pendingMember));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidcAuth.isAuthenticated]);

  const handleAssociate = (memberId: number) => {
    if (!teamData?.team_id) return;
    if (oidcAuth.isAuthenticated) {
      void linkNow(teamData.team_id, memberId);
      return;
    }
    sessionStorage.setItem(PENDING_LINK_MEMBER_KEY, String(memberId));
    sessionStorage.setItem(PENDING_LINK_TEAM_KEY, String(teamData.team_id));
    onStaffLogin();
  };

  if (isLoading) {
    return <LoadingState message="A carregar equipa..." />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-500">
      <header className="text-center">
        <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
          <Users className="h-3.5 w-3.5" /> A minha equipa
        </p>
        <h1 className="rally-display mt-2 text-4xl font-bold text-foreground">{team?.name}</h1>
      </header>

      <div className="rally-surface rally-elevate space-y-3 rounded-[22px] p-6">
        {team?.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/40 p-4"
          >
            <div>
              <p className="font-semibold text-foreground">
                {member.name}
                {member.is_captain && (
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Capitão
                  </span>
                )}
              </p>
            </div>

            {member.is_linked ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Associado
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={linkingId === member.id}
                onClick={() => handleAssociate(member.id)}
              >
                {linkingId === member.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Associar a mim
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
