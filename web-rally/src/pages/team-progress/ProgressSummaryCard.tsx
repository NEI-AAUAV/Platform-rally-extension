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
  const pct = (completedCount / (totalCount || 1)) * 100;

  return (
    <div className="rally-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        <span>Progresso: {completedCount} de {totalCount} postos</span>
        {showScore && <span>Total: {totalScore} pontos</span>}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="rally-bg-accent h-full transition-[width] duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
