import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFormContext, Controller } from "react-hook-form";

type TeamSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function TeamSettings({ className = "", disabled = false }: TeamSettingsProps) {
  const { register, control } = useFormContext();

  return (
    <div className={cn("rally-surface rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Gestão de Equipas
        </CardTitle>
        <CardDescription>Configurações relacionadas com equipas e membros</CardDescription>
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
              {...register("max_teams", { valueAsNumber: true })}
              className="border-border bg-muted"
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
              {...register("max_members_per_team", { valueAsNumber: true })}
              className="border-border bg-muted"
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
                id="enable_versus"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="enable_versus">Ativar modo versus (competição entre equipas)</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="allow_staff_registration"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="allow_staff_registration"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="allow_staff_registration">Inscrições no local pelo staff</Label>
            <p className="text-xs text-muted-foreground">
              Permite ao staff acrescentar membros a uma equipa durante o evento, para quem
              apareça sem se ter inscrito antes.
            </p>
          </div>
        </div>
      </CardContent>
    </div>
  );
}
