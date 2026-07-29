import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Crown, LogIn, Search } from "lucide-react";
import { RallyButton } from "@/components/themes/rally";
import { ProfileService } from "@/services/ProfileService";
import type { ClaimableMember } from "@/types/profile";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { detail?: string } }).body;
    if (body?.detail) return body.detail;
  }
  if (error instanceof Error) return error.message;
  return "Algo correu mal. Tenta novamente.";
}

/**
 * Shown on the profile when a logged-in NEI user is not yet on a team. They
 * enter their team's access code, pick the placeholder member that is them, and
 * claim it — linking that membership (and its history) to their account.
 */
export default function JoinTeamCard() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const claimable = useQuery({
    queryKey: ["profile", "claimable", submittedCode],
    queryFn: () => ProfileService.getClaimable(submittedCode as string),
    enabled: submittedCode !== null,
    retry: false,
  });

  const claim = useMutation({
    mutationFn: (memberId: number) =>
      ProfileService.claimMembership(memberId, submittedCode as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
    },
  });

  const trimmed = code.trim();

  return (
    <div className="rally-surface rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Users className="rally-accent h-5 w-5" />
        <h2 className="text-lg font-semibold text-foreground">Associa-te à tua equipa</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Introduz o código da tua equipa e escolhe o teu nome para ligares a tua conta NEI.
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          claim.reset();
          if (trimmed.length > 0) setSubmittedCode(trimmed);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm uppercase tracking-wide outline-none focus:border-[color:var(--rally-accent,theme(colors.primary.DEFAULT))]"
          aria-label="Código da equipa"
        />
        <RallyButton type="submit" variant="primary" size="md" disabled={trimmed.length === 0}>
          <Search className="h-4 w-4" />
          Procurar
        </RallyButton>
      </form>

      {claimable.isError && (
        <p className="mt-3 text-sm text-destructive">{errorMessage(claimable.error)}</p>
      )}

      {claimable.isSuccess && (
        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {claimable.data.team_name}
          </p>
          {claimable.data.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Não há membros por associar nesta equipa. Pede a um responsável para te adicionar.
            </p>
          ) : (
            claimable.data.members.map((member: ClaimableMember) => (
              <button
                key={member.id}
                type="button"
                disabled={claim.isPending}
                onClick={() => claim.mutate(member.id)}
                className="rally-surface flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition hover:brightness-105 disabled:opacity-50"
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {member.name}
                  {member.is_captain && <Crown className="rally-accent h-4 w-4" />}
                </span>
                <LogIn className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}

      {claim.isError && (
        <p className="mt-3 text-sm text-destructive">{errorMessage(claim.error)}</p>
      )}
    </div>
  );
}
