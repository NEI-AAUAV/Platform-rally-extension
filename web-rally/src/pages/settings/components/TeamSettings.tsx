import { Users } from 'lucide-react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFormContext, Controller } from 'react-hook-form';
import { useThemedComponents } from '@/components/themes';

type TeamSettingsProps = Readonly<{

  className?: string;
  disabled?: boolean;
}>

export default function TeamSettings({ className = "", disabled = false }: TeamSettingsProps) {
  const { Card } = useThemedComponents();
  const { register, control } = useFormContext();

  return (
    <Card variant="default" padding="none" rounded="2xl" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Gestão de Equipas
        </CardTitle>
        <CardDescription>
          Configurações relacionadas com equipas e membros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max_teams">Número máximo de equipas</Label>
            <Input
              id="max_teams"
              type="number"
              min="1"
              max="100"
              disabled={disabled}
              {...register('max_teams', { valueAsNumber: true })}
              className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_members_per_team">Máximo de membros por equipa</Label>
            <Input
              id="max_members_per_team"
              type="number"
              min="1"
              max="50"
              disabled={disabled}
              {...register('max_members_per_team', { valueAsNumber: true })}
              className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Controller
            name="enable_versus"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="enable_versus">
            Ativar modo versus (competição entre equipas)
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
