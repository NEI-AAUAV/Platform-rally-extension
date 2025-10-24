import React from 'react';
import { Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFormContext } from 'react-hook-form';

interface ScoringSettingsProps {
  className?: string;
  disabled?: boolean;
}

export default function ScoringSettings({ className = "", disabled = false }: ScoringSettingsProps) {
  const { register, watch, setValue } = useFormContext();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Sistema de Pontuação
        </CardTitle>
        <CardDescription>
          Configurações de pontuação e penalizações
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="penalty_per_puke">Penalização por vómito</Label>
          <Input
            id="penalty_per_puke"
            type="number"
            min="-100"
            max="0"
            disabled={disabled}
            {...register('penalty_per_puke', { valueAsNumber: true })}
            className="bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]"
          />
          <p className="text-xs text-[rgb(255,255,255,0.6)]">
            Pontos perdidos por cada vómito (deve ser negativo)
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            id="checkpoint_order_matters"
            checked={watch('checkpoint_order_matters')}
            onCheckedChange={(checked) => setValue('checkpoint_order_matters', checked)}
            disabled={disabled}
          />
          <Label htmlFor="checkpoint_order_matters">
            A ordem dos checkpoints importa para a pontuação
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            id="enable_staff_scoring"
            checked={watch('enable_staff_scoring')}
            onCheckedChange={(checked) => setValue('enable_staff_scoring', checked)}
            disabled={disabled}
          />
          <Label htmlFor="enable_staff_scoring">
            Permitir pontuação manual pelos staff
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
