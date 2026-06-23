import { Users } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import type { DetailedTeam } from "@/client";

type TeamMembersCardProps = Readonly<{
  team: DetailedTeam;
}>;

export default function TeamMembersCard({ team }: TeamMembersCardProps) {
  const { Card, config } = useThemedComponents();

  return (
    <Card className="p-6 backdrop-blur-sm bg-black/20 border-white/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-white/5">
          <Users className="w-5 h-5" style={{ color: config?.colors?.primary }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: config?.colors?.text }}>Membros da Equipa</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {team.members?.map((member) => (
          <div
            key={member.id}
            className="px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/10"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: config?.colors?.text }}
          >
            {member.name}
          </div>
        ))}
      </div>
    </Card>
  );
}
