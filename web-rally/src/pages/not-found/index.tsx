import { Compass } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

/** Router-level 404, wired as `notFoundComponent` in `router/index.tsx`. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
      <EmptyState
        icon={<Compass className="h-10 w-10 text-muted-foreground" />}
        title="Página não encontrada"
        description="O link que seguiste não existe ou foi movido."
        action={
          <Button asChild size="sm">
            <Link to="/">Voltar ao início</Link>
          </Button>
        }
      />
    </div>
  );
}
