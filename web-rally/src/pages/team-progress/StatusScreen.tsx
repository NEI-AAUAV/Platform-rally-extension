import { LoadingState } from "@/components/shared";

type StatusScreenProps = Readonly<{
  variant: "loading" | "error";
  title: string;
  description?: string;
}>;

export default function StatusScreen({ variant, title, description }: StatusScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="rally-surface rally-elevate-lg w-full max-w-md p-8 text-center">
        {variant === "loading" ? (
          <>
            <LoadingState variant="block" message={title} />
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-red-500">{title}</p>
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
          </>
        )}
      </div>
    </div>
  );
}
