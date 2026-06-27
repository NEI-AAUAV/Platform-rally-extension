import { Users } from "lucide-react";
import type { DetailedTeam } from "@/client";

type TeamMembersCardProps = Readonly<{
  team: DetailedTeam;
}>;

export default function TeamMembersCard({ team }: TeamMembersCardProps) {
  return (
    <div className="rally-surface rounded-xl border border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="rally-bg-accent-soft rally-accent rounded-lg p-2">
          <Users className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Membros da Equipa</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {team.members?.map((member) => (
          <div
            key={member.id}
            className="rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {member.name}
          </div>
        ))}
      </div>
    </div>
  );
}
