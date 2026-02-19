import { Calendar } from 'lucide-react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormContext } from 'react-hook-form';
import { useThemedComponents } from '@/components/themes';

type RallyTimingSettingsProps = Readonly<{

  className?: string;
  disabled?: boolean;
}>

export default function RallyTimingSettings({ className = "", disabled = false }: RallyTimingSettingsProps) {
  const { Card } = useThemedComponents();
  const { register } = useFormContext();

  return (
    <Card variant="default" padding="none" rounded="2xl" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Horários do Rally
        </CardTitle>
        <CardDescription>
          Definir quando o rally começa e termina
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rally_start_time">Hora de início do Rally</Label>
          <Input
            id="rally_start_time"
            type="datetime-local"
            disabled={disabled}
            {...register('rally_start_time')}
            className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
          />
          <p className="text-xs text-[rgb(255,255,255,0.6)]">
            Deixe em branco para não definir hora de início
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="rally_end_time">Hora de fim do Rally</Label>
          <Input
            id="rally_end_time"
            type="datetime-local"
            disabled={disabled}
            {...register('rally_end_time')}
            className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
          />
          <p className="text-xs text-[rgb(255,255,255,0.6)]">
            Deixe em branco para não definir hora de fim
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
