import { cn } from "@/lib/utils";
import { Target } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFormContext, Controller } from "react-hook-form";

type ScoringSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function ScoringSettings({
  className = "",
  disabled = false,
}: ScoringSettingsProps) {
  const { register, control } = useFormContext();

  return (
    <div className={cn("rally-surface rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Sistema de Pontuação
        </CardTitle>
        <CardDescription>Configurações de pontuação e penalizações</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="penalty_per_puke">Penalização por vómito</Label>
            <Input
              id="penalty_per_puke"
              type="number"
              min="-100"
              max="0"
              disabled={disabled}
              {...register("penalty_per_puke", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Pontos perdidos por cada vómito (deve ser negativo)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="penalty_per_not_drinking">Penalização por não beber</Label>
            <Input
              id="penalty_per_not_drinking"
              type="number"
              min="-100"
              max="0"
              disabled={disabled}
              {...register("penalty_per_not_drinking", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Pontos perdidos por não beber obrigatório (deve ser negativo)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bonus_per_extra_shot">Bónus por shot extra</Label>
            <Input
              id="bonus_per_extra_shot"
              type="number"
              min="0"
              max="100"
              disabled={disabled}
              {...register("bonus_per_extra_shot", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">Pontos ganhos por cada shot extra</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_extra_shots_per_member">Máximo shots extra por membro</Label>
            <Input
              id="max_extra_shots_per_member"
              type="number"
              min="1"
              max="20"
              disabled={disabled}
              {...register("max_extra_shots_per_member", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Número máximo de shots extra por membro da equipa
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="checkpoint_order_matters"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="checkpoint_order_matters"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="checkpoint_order_matters">
            A ordem dos checkpoints importa para a pontuação
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="gps_checkin_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="gps_checkin_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="gps_checkin_enabled">Check-in por GPS feito pela equipa</Label>
            <p className="text-xs text-muted-foreground">
              Requer coordenadas e raio de chegada definidos nos postos
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="enable_staff_scoring"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="enable_staff_scoring"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="enable_staff_scoring">Permitir pontuação manual pelos staff</Label>
        </div>
      </CardContent>
    </div>
  );
}
