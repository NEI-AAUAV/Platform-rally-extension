import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2, Users } from "lucide-react";
import { getGuideTeam } from "@/client";
import QRCodeDisplay from "@/components/qr/QRCodeDisplay";

/**
 * The guide's own assigned team: who they are, who is on it, and the QR a
 * member can scan to log in — the same self-service info a team sees about
 * itself, scoped server-side to the one team this guide is assigned to.
 */
export default function GuideTeamPanel() {
  const {
    data: team,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["guide-team"],
    queryFn: async () => (await getGuideTeam()).data,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar equipa…
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div className="rally-surface flex flex-col items-center gap-3 py-16 text-center">
        <Users className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-muted-foreground">Ainda não tens equipa atribuída</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section className="rally-surface space-y-3 p-4">
        <h2 className="rally-display text-2xl font-bold text-foreground">{team.name}</h2>
        <p className="rally-accent flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
          <Users className="h-3.5 w-3.5" /> Membros ({team.members.length})
        </p>
        <ul className="space-y-1.5">
          {team.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
            >
              {member.is_captain && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
              <span className="truncate font-medium">{member.name}</span>
            </li>
          ))}
        </ul>
      </section>

      {team.access_code && (
        <section className="rally-surface flex items-center justify-center p-4">
          <QRCodeDisplay accessCode={team.access_code} />
        </section>
      )}
    </div>
  );
}
