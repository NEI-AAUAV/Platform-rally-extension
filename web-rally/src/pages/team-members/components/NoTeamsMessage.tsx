type NoTeamsMessageProps = Readonly<{
  description: string;
}>;

export default function NoTeamsMessage({ description }: NoTeamsMessageProps) {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-50 p-4 dark:bg-yellow-950/30 sm:p-6">
      <h3 className="mb-2 font-semibold text-yellow-800 dark:text-yellow-300">
        Nenhuma equipa encontrada
      </h3>
      <p className="text-sm text-yellow-800 dark:text-yellow-200">{description}</p>
    </div>
  );
}
