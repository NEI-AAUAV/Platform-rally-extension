import type { DetailedTeam } from "@/client";

type TeamMembersCardProps = Readonly<{
  team: DetailedTeam;
}>;

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TeamMembersCard({ team }: TeamMembersCardProps) {
  return (
    <div className="rally-surface rounded-xl border border-border p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Membros
      </p>
      <div className="flex flex-wrap gap-2">
        {team.members?.map((member) => (
          <span
            key={member.id}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary py-1.5 pl-1.5 pr-4 text-sm font-semibold text-foreground"
          >
            <span className="rally-bg-accent-soft rally-accent grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold">
              {initialsOf(member.name)}
            </span>
            {member.name}
          </span>
        ))}
      </div>
    </div>
  );
}
