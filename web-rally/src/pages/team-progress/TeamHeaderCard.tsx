import { Trophy } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import type { DetailedTeam } from "@/client";

type TeamHeaderCardProps = Readonly<{
  team: DetailedTeam;
  showScore: boolean;
  showRanking: boolean;
}>;

export default function TeamHeaderCard({ team, showScore, showRanking }: TeamHeaderCardProps) {
  const { Card, config } = useThemedComponents();

  return (
    <Card className="p-8 backdrop-blur-md bg-black/30 border-white/10 shadow-xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2 tracking-tight" style={{ color: config?.colors?.text }}>
          {team.name}
        </h1>
        {showScore && (
          <div className="mt-4 p-4 rounded-xl bg-white/5 inline-block">
            <div
              className="flex items-center justify-center gap-2 text-3xl font-bold"
              style={{ color: config?.colors?.primary }}
            >
              <Trophy className="w-8 h-8" />
              {team.total} <span className="text-lg font-normal opacity-80 self-end mb-1">pontos</span>
            </div>
            {showRanking && (
              <div
                className="text-sm mt-1 font-medium px-3 py-1 rounded-full inline-block"
                style={{ backgroundColor: `${config?.colors?.primary}20`, color: config?.colors?.primary }}
              >
                {team.classification}º lugar
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
