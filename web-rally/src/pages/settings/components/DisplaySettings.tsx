import { cn } from "@/lib/utils";
import { Eye } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormContext, Controller } from "react-hook-form";

type DisplaySettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function DisplaySettings({
  className = "",
  disabled = false,
}: DisplaySettingsProps) {
  const { control } = useFormContext();

  return (
    <div className={cn("rally-surface rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Configurações de Visualização
        </CardTitle>
        <CardDescription>Controlar o que é visível para os utilizadores</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rally_theme">Tema do Rally</Label>
          <Controller
            name="rally_theme"
            control={control}
            defaultValue="bloody"
            render={({ field }) => (
              <Select
                value={field.value || "bloody"}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id="rally_theme" className="border-border bg-muted">
                  <SelectValue placeholder="Selecione um tema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nei">NEI Rally (Verde)</SelectItem>
                  <SelectItem value="bloody">Halloween (Bloody)</SelectItem>
                  <SelectItem value="default">Rally Tascas (Legacy)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            O tema controla as cores e estilo visual da aplicação
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="show_live_leaderboard"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="show_live_leaderboard"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="show_live_leaderboard">Mostrar leaderboard em tempo real</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="show_team_details"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="show_team_details"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="show_team_details">Mostrar detalhes das equipas</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="show_checkpoint_map"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="show_checkpoint_map"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="show_checkpoint_map">Mostrar mapa dos checkpoints</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="participant_view_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="participant_view_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="participant_view_enabled">Ativar visualização para participantes</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="show_route_mode">Modo de Visualização do Trajeto</Label>
          <Controller
            name="show_route_mode"
            control={control}
            defaultValue="focused"
            render={({ field }) => (
              <Select
                value={field.value || "focused"}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id="show_route_mode" className="border-border bg-muted">
                  <SelectValue placeholder="Selecione o modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="focused">Apenas próximo posto</SelectItem>
                  <SelectItem value="complete">Trajeto completo</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">Controla o que as equipas veem do trajeto</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="show_score_mode">Modo de Visualização da Pontuação</Label>
          <Controller
            name="show_score_mode"
            control={control}
            defaultValue="hidden"
            render={({ field }) => (
              <Select
                value={field.value || "hidden"}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id="show_score_mode" className="border-border bg-muted">
                  <SelectValue placeholder="Selecione o modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hidden">Oculto</SelectItem>
                  <SelectItem value="individual">Apenas própria pontuação</SelectItem>
                  <SelectItem value="competitive">Classificação completa</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Controla o que as equipas veem das pontuações
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="public_access_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="public_access_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="public_access_enabled">Permitir acesso público (sem login)</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="allow_photo_as_team_photo"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="allow_photo_as_team_photo"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="allow_photo_as_team_photo">
            Permitir staff definir foto de atividade como foto da equipa
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="guide_mode_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="guide_mode_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="guide_mode_enabled">Ativar funcionalidade de modo guia</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="guide_mode_active"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="guide_mode_active"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="guide_mode_active">Modo guia ativo neste evento</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="badges_enabled"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="badges_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <Label htmlFor="badges_enabled">Ativar crachás / conquistas</Label>
        </div>
      </CardContent>
    </div>
  );
}
