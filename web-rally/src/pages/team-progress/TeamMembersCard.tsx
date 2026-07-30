import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import type { PrivilegedDetailedTeam } from "@/client";
import { claimMembership } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { useProfile } from "@/hooks/useProfile";
import { useAppToast } from "@/hooks/use-toast";

type TeamMembersCardProps = Readonly<{
  team: PrivilegedDetailedTeam;
}>;

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { detail?: string } }).body;
    if (body?.detail) return body.detail;
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível associar.";
}

export default function TeamMembersCard({ team }: TeamMembersCardProps) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const toast = useAppToast();

  // Only offer "this is me" when logged in with NEI, not yet on a team, and we
  // actually hold the team's access code (the server's proof of membership).
  const accessCode = team.access_code;
  const canClaim =
    isAuthenticated && profile != null && profile.current_team_id == null && !!accessCode;

  const claim = useMutation({
    mutationFn: (memberId: number) =>
      claimMembership({
        path: { member_user_id: memberId },
        body: { access_code: accessCode ?? "" },
      }),
    onSuccess: () => {
      toast.success("Conta associada! O teu histórico foi atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="rally-surface rounded-xl border border-border p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Membros
      </p>
      {canClaim && (
        <p className="mb-3 text-xs text-muted-foreground">
          És um destes membros? Toca no teu nome para ligares a tua conta NEI.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {team.members?.map((member) => {
          const content = (
            <>
              <span className="rally-bg-accent-soft grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-foreground">
                {initialsOf(member.name)}
              </span>
              {member.name}
              {canClaim && <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />}
            </>
          );
          const className =
            "inline-flex items-center gap-2 rounded-full border border-border bg-secondary py-1.5 pl-1.5 pr-4 text-sm font-semibold text-foreground";

          return canClaim ? (
            <button
              key={member.id}
              type="button"
              disabled={claim.isPending}
              onClick={() => claim.mutate(member.id)}
              className={`${className} rally-press transition hover:brightness-105 disabled:opacity-50`}
            >
              {content}
            </button>
          ) : (
            <span key={member.id} className={className}>
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
