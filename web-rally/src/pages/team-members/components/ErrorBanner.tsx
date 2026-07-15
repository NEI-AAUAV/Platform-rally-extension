type ErrorBannerProps = Readonly<{
  title: string;
  error: unknown;
}>;

export default function ErrorBanner({ title, error }: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-50 p-4 dark:bg-red-950/30 sm:p-6">
      <h3 className="mb-2 font-semibold text-red-700 dark:text-red-400">{title}</h3>
      <p className="text-sm text-red-700 dark:text-red-300">
        {error instanceof Error ? error.message : "Erro desconhecido"}
      </p>
    </div>
  );
}
