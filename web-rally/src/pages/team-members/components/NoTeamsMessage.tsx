type NoTeamsMessageProps = Readonly<{
  description: string;
}>;

export default function NoTeamsMessage({ description }: NoTeamsMessageProps) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 sm:p-6">
      <h3 className="mb-2 font-semibold text-warning-ink">Nenhuma equipa encontrada</h3>
      <p className="text-sm text-warning-ink">{description}</p>
    </div>
  );
}
