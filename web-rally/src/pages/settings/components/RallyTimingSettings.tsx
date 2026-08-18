import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useFormContext } from "react-hook-form";

type RallyTimingSettingsProps = Readonly<{
  className?: string;
}>;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Não definido";
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Read-only: the window is set on the event, not here. Shown anyway because an
 * admin tuning team limits usually wants to know when the thing actually runs.
 */
export default function RallyTimingSettings({ className = "" }: RallyTimingSettingsProps) {
  const { getValues } = useFormContext();
  const startTime = getValues("rally_start_time");
  const endTime = getValues("rally_end_time");

  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Calendar className="h-4 w-4" />
        Horários do Rally
      </h3>
      <p className="text-xs text-muted-foreground">
        Definidos no evento, não aqui — evita ter de configurar os horários duas vezes
      </p>
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div>
          <p className="text-muted-foreground">Início</p>
          <p className="font-medium">{formatDateTime(startTime)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Fim</p>
          <p className="font-medium">{formatDateTime(endTime)}</p>
        </div>
      </div>
      <Link to="/admin" className="text-sm text-primary underline underline-offset-2">
        Editar horários na gestão de eventos
      </Link>
    </section>
  );
}
