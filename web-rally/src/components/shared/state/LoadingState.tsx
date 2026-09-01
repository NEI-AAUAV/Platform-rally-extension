import Spinner from "./Spinner";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export default function LoadingState({
  message = "Carregando...",
  className = "",
}: Readonly<LoadingStateProps>) {
  return (
    <div role="status" className={`flex items-center justify-center py-8 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner size="sm" label="" />
        <span>{message}</span>
      </div>
    </div>
  );
}
