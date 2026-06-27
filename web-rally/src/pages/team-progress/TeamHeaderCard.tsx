import { Trophy } from "lucide-react";
import type { DetailedTeam } from "@/client";

type TeamHeaderCardProps = Readonly<{
  team: DetailedTeam;
  showScore: boolean;
  showRanking: boolean;
}>;

export default function TeamHeaderCard({ team, showScore, showRanking }: TeamHeaderCardProps) {
  return (
    <div className="rally-surface rally-elevate-lg rounded-2xl p-8 text-center">
      <h1 className="rally-display text-4xl font-bold tracking-tight text-foreground mb-2">
        {team.name}
      </h1>
      {showScore && (
        <div className="mt-4 inline-block rounded-xl bg-muted px-6 py-4">
          <div className="flex items-center justify-center gap-2 text-3xl font-bold rally-accent">
            <Trophy className="w-8 h-8" />
            {team.total}
            <span className="text-lg font-normal text-muted-foreground self-end mb-1">pontos</span>
          </div>
          {showRanking && (
            <div className="mt-2 inline-block rounded-full rally-bg-accent-soft rally-accent px-3 py-1 text-sm font-medium">
              {team.classification}º lugar
            </div>
          )}
        </div>
      )}
    </div>
  );
}
