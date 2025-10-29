import { Eye } from 'lucide-react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFormContext } from 'react-hook-form';
import { useThemedComponents } from '@/components/themes';

interface DisplaySettingsProps {
  className?: string;
  disabled?: boolean;
}

export default function DisplaySettings({ className = "", disabled = false }: DisplaySettingsProps) {
  const { Card } = useThemedComponents();
  const { register, watch, setValue } = useFormContext();

  return (
    <Card variant="default" padding="none" rounded="2xl" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="w-5 h-5" />
          Configurações de Visualização
        </CardTitle>
        <CardDescription>
          Controlar o que é visível para os utilizadores
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rally_theme">Tema do Rally</Label>
          <Input
            id="rally_theme"
            placeholder="Ex: Rally Halloween 2024"
            disabled={disabled}
            {...register('rally_theme')}
            className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            checked={watch('show_live_leaderboard')}
            onCheckedChange={(checked) => setValue('show_live_leaderboard', checked)}
            disabled={disabled}
          />
          <Label htmlFor="show_live_leaderboard">
            Mostrar leaderboard em tempo real
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            checked={watch('show_team_details')}
            onCheckedChange={(checked) => setValue('show_team_details', checked)}
            disabled={disabled}
          />
          <Label htmlFor="show_team_details">
            Mostrar detalhes das equipas
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            checked={watch('show_checkpoint_map')}
            onCheckedChange={(checked) => setValue('show_checkpoint_map', checked)}
            disabled={disabled}
          />
          <Label htmlFor="show_checkpoint_map">
            Mostrar mapa dos checkpoints
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            checked={watch('public_access_enabled')}
            onCheckedChange={(checked) => setValue('public_access_enabled', checked)}
            disabled={disabled}
          />
          <Label htmlFor="public_access_enabled">
            Permitir acesso público (sem login)
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
