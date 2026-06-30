import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@tanstack/react-router';
import { useFormContext } from 'react-hook-form';

type RallyTimingSettingsProps = Readonly<{
  className?: string;
}>

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

export default function RallyTimingSettings({ className = "" }: RallyTimingSettingsProps) {
  const { getValues } = useFormContext();
  const startTime = getValues("rally_start_time");
  const endTime = getValues("rally_end_time");

  return (
    <div className={cn("rally-surface rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Horários do Rally
        </CardTitle>
        <CardDescription>
          Definidos no evento, não aqui — evita ter de configurar os horários duas vezes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Início</p>
            <p className="font-medium">{formatDateTime(startTime)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fim</p>
            <p className="font-medium">{formatDateTime(endTime)}</p>
          </div>
        </div>
        <Link
          to="/admin"
          className="text-sm text-primary underline underline-offset-2"
        >
          Editar horários na gestão de eventos
        </Link>
      </CardContent>
    </div>
  );
}
