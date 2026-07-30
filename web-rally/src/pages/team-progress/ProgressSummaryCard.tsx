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
  const pct = Math.round((completedCount / (totalCount || 1)) * 100);

  return (
    <div className="rally-surface rounded-xl border border-border p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">Progresso do percurso</span>
        <span className="rally-display rally-accent text-sm font-bold">{pct}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="rally-bg-accent h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showScore && (
        <p className="mt-3 text-xs text-muted-foreground">
          {completedCount} de {totalCount} postos · {totalScore} pontos
        </p>
      )}
    </div>
  );
}
