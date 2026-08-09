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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="hint_penalty">Custo de uma pista</Label>
            <Input
              id="hint_penalty"
              type="number"
              min="-100"
              max="0"
              disabled={disabled}
              {...register("hint_penalty", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Pontos perdidos sempre que uma equipa desbloqueia uma pista do posto onde está (deve
              ser negativo). 0 torna as pistas gratuitas.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skip_penalty">Custo de desistir de um posto</Label>
            <Input
              id="skip_penalty"
              type="number"
              min="-100"
              max="0"
              disabled={disabled}
              {...register("skip_penalty", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Uma equipa que não consiga resolver o enigma pode desistir do posto e seguir em
              frente. Não o pontua e paga isto (deve ser negativo). Sem esta saída, fica presa nesse
              posto até ao fim do evento.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="hints_enabled"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="hints_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="hints_enabled">Permitir pedir pistas</Label>
            <p className="text-xs text-muted-foreground">
              Desliga para tirar a escada de pistas às equipas. O custo acima fica guardado — 0
              pontos torna as pistas gratuitas, isto remove-as por completo.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="skip_enabled"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="skip_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="skip_enabled">Permitir desistir de um posto</Label>
            <p className="text-xs text-muted-foreground">
              Desliga só se tiveres a certeza: sem esta saída, uma equipa que não resolva o enigma
              fica presa nesse posto até ao fim do evento.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="reveal_on_arrival"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="reveal_on_arrival"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="reveal_on_arrival">Revelar o posto ao chegar</Label>
            <p className="text-xs text-muted-foreground">
              Ligado, chegar ao posto revela-o mesmo antes de o staff avaliar a prova. Desligado, só
              é revelado depois da avaliação.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="guide_manual_arrival_enabled"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="guide_manual_arrival_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="guide_manual_arrival_enabled">Guias podem marcar chegadas</Label>
            <p className="text-xs text-muted-foreground">
              A alternativa ao check-in por GPS quando este falha — sem bateria, sem rede, ou dentro
              de um edifício.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="proximity_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="proximity_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="proximity_enabled">Botão: estou perto?</Label>
            <p className="text-xs text-muted-foreground">
              Da a equipa uma banda de distancia (por exemplo, menos de 500m), nunca metros exatos
              nem coordenadas. Ajuda quem nao conhece a cidade sem entregar o sitio.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="compass_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="compass_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="compass_enabled">Bússola (só muito perto)</Label>
            <p className="text-xs text-muted-foreground">
              Acrescenta uma direcao em 8 setores, e so quando a equipa ja esta dentro da banda mais
              proxima. Um rumo preciso, tirado de dois sitios, dava o ponto exato — por isso e
              grosseiro e tardio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="search_radius_m">Raio da zona de busca (metros)</Label>
            <Input
              id="search_radius_m"
              type="number"
              min="0"
              max="5000"
              disabled={disabled}
              {...register("search_radius_m", { valueAsNumber: true })}
              className="border-border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Desenha no mapa um circulo onde o posto esta algures. 0 nao mostra circulo nenhum. O
              circulo nao esta centrado no posto, de proposito.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="route_stages_enabled"
            control={control}
            defaultValue={false}
            render={({ field }) => (
              <Switch
                id="route_stages_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="route_stages_enabled">Etapas da rota</Label>
            <p className="text-xs text-muted-foreground">
              Divide a rota em blocos com regras diferentes — ex: universidade por ordem, depois
              bares à escolha (3 de 5). Cria e configura as etapas na aba de Checkpoints. Sem
              etapas criadas, a rota corre como um bloco só e vale a regra geral abaixo. Desligar a
              meio do evento abre tudo sem apagar as etapas.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Controller
            name="checkpoint_hours_enabled"
            control={control}
            defaultValue={true}
            render={({ field }) => (
              <Switch
                id="checkpoint_hours_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          <div>
            <Label htmlFor="checkpoint_hours_enabled">Respeitar horários dos postos</Label>
            <p className="text-xs text-muted-foreground">
              Recusa check-ins fora da janela de cada posto. Desliga isto se um bar abriu mais cedo —
              é mais rápido do que limpar os horários um a um.
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
