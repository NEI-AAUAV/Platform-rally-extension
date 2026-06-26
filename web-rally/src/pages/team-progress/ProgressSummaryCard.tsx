import { useThemedComponents } from "@/components/themes/ThemeContext";

type ProgressSummaryCardProps = Readonly<{
  completedCount: number;
  totalCount: number;
  totalScore: number;
  showScore: boolean;
}>;

export default function ProgressSummaryCard({
  completedCount,
  totalCount,
  totalScore,
  showScore,
}: ProgressSummaryCardProps) {
  const { Card, config } = useThemedComponents();

  return (
    <Card className="p-4 backdrop-blur-sm bg-muted border-border">
      <div className="flex items-center justify-between text-sm font-medium" style={{ color: config?.colors?.text }}>
        <span className="opacity-80">
          Progresso: {completedCount} de {totalCount} postos
        </span>
        {showScore && <span className="opacity-80">Total: {totalScore} pontos</span>}
      </div>
      <div className="mt-3 h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-1000 ease-out"
          style={{
            width: `${(completedCount / (totalCount || 1)) * 100}%`,
            backgroundColor: config?.colors?.primary,
          }}
        />
      </div>
    </Card>
  );
}
