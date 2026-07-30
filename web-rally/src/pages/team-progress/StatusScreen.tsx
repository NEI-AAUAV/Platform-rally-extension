import { Loader2 } from "lucide-react";

type StatusScreenProps = Readonly<{
  variant: "loading" | "error";
  title: string;
  description?: string;
}>;

export default function StatusScreen({ variant, title, description }: StatusScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="rally-surface rally-elevate-lg w-full max-w-md rounded-2xl p-8 text-center">
        {variant === "loading" ? (
          <>
            <Loader2 className="rally-accent mx-auto mb-4 h-12 w-12 animate-spin" />
            <p className="text-lg font-semibold text-foreground">{title}</p>
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
