type ErrorBannerProps = Readonly<{
  title: string;
  error: unknown;
}>;

export default function ErrorBanner({ title, error }: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 sm:p-6">
      <h3 className="mb-2 font-semibold text-destructive-ink">{title}</h3>
      <p className="text-sm text-destructive-ink">
        {error instanceof Error ? error.message : "Erro desconhecido"}
      </p>
    </div>
  );
}
