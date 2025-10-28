import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActivityType, ActivityCreate, Checkpoint } from "@/types/activityTypes";
import { AlertCircle } from "lucide-react";
import ActivityTypeInfo from "@/components/ActivityTypeInfo";

const activityFormSchema = z.object({
  name: z.string().min(1, "Nome da atividade é obrigatório"),
  description: z.string().optional(),
  activity_type: z.nativeEnum(ActivityType, {
    errorMap: () => ({ message: "Tipo de atividade é obrigatório" }),
  }),
  checkpoint_id: z.number().min(1, "Checkpoint é obrigatório"),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().default(true),
});

type ActivityForm = z.infer<typeof activityFormSchema>;

interface ActivityFormProps {
  checkpoints: Checkpoint[];
  onSubmit: (data: ActivityCreate) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
  initialData?: Partial<ActivityForm>;
}

const activityTypeLabels = {
  [ActivityType.TIME_BASED]: "Baseada em Tempo",
  [ActivityType.SCORE_BASED]: "Baseada em Pontuação", 
  [ActivityType.BOOLEAN]: "Sim/Não",
  [ActivityType.TEAM_VS]: "Equipa vs Equipa",
  [ActivityType.GENERAL]: "Geral",
};

export default function ActivityForm({
  checkpoints,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
  initialData,
}: ActivityFormProps) {
  const form = useForm<ActivityForm>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: "",
      description: "",
      activity_type: ActivityType.GENERAL,
      checkpoint_id: checkpoints[0]?.id || 0,
      config: {},
      is_active: true,
      ...initialData,
    },
  });

  const watchActivityType = form.watch("activity_type");
  const [configData, setConfigData] = useState<Record<string, any>>(initialData?.config || {});

  const handleSubmit = (data: ActivityForm) => {
    onSubmit({ ...data, config: configData });
  };
  
  const updateConfig = (key: string, value: any) => {
    setConfigData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">
          {initialData ? "Editar Atividade" : "Criar Nova Atividade"}
        </h3>
        <p className="text-[rgb(255,255,255,0.7)]">
          {initialData 
            ? "Modifique os detalhes da atividade"
            : "Configure uma nova atividade para o Rally"
          }
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Atividade</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex: Cabo de Guerra"
                    {...field}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white placeholder:text-[rgb(255,255,255,0.5)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição (Opcional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Descreva a atividade..."
                    {...field}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white placeholder:text-[rgb(255,255,255,0.5)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="checkpoint_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Checkpoint</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-full p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white"
                  >
                    {checkpoints.map((checkpoint) => (
                      <option key={checkpoint.id} value={checkpoint.id} className="bg-gray-800">
                        {checkpoint.name} - {checkpoint.description}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="activity_type"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormLabel>Tipo de Atividade</FormLabel>
                  <ActivityTypeInfo />
                </div>
                <FormControl>
                  <select
                    {...field}
                    className="w-full p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white"
                  >
                    {Object.entries(activityTypeLabels).map(([value, label]) => (
                      <option key={value} value={value} className="bg-gray-800">
                        {label}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Activity Type Specific Config Fields */}
          {watchActivityType === ActivityType.TIME_BASED && (
            <div className="space-y-4 p-4 bg-[rgb(255,255,255,0.02)] border border-[rgb(255,255,255,0.1)] rounded-lg">
              <h4 className="font-medium text-white">Configurações de Atividade Baseada em Tempo</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos Máximos (1º lugar)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.max_points || 100}
                    onChange={(e) => updateConfig("max_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos Mínimos (último lugar)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.min_points || 10}
                    onChange={(e) => updateConfig("min_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="10"
                  />
                </div>
              </div>
            </div>
          )}

          {watchActivityType === ActivityType.SCORE_BASED && (
            <div className="space-y-4 p-4 bg-[rgb(255,255,255,0.02)] border border-[rgb(255,255,255,0.1)] rounded-lg">
              <h4 className="font-medium text-white">Configurações de Atividade Baseada em Pontuação</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontuação Máxima
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.max_points || 100}
                    onChange={(e) => updateConfig("max_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontuação Base
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.base_score || 50}
                    onChange={(e) => updateConfig("base_score", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="50"
                  />
                </div>
              </div>
            </div>
          )}

          {watchActivityType === ActivityType.BOOLEAN && (
            <div className="space-y-4 p-4 bg-[rgb(255,255,255,0.02)] border border-[rgb(255,255,255,0.1)] rounded-lg">
              <h4 className="font-medium text-white">Configurações de Atividade Sim/Não</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos por Sucesso
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.success_points || 100}
                    onChange={(e) => updateConfig("success_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos por Falha
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.failure_points || 0}
                    onChange={(e) => updateConfig("failure_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}

          {watchActivityType === ActivityType.GENERAL && (
            <div className="space-y-4 p-4 bg-[rgb(255,255,255,0.02)] border border-[rgb(255,255,255,0.1)] rounded-lg">
              <h4 className="font-medium text-white">Configurações de Atividade Geral</h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos Mínimos
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.min_points || 0}
                    onChange={(e) => updateConfig("min_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos Máximos
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.max_points || 100}
                    onChange={(e) => updateConfig("max_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos Padrão
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.default_points || 50}
                    onChange={(e) => updateConfig("default_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="50"
                  />
                </div>
              </div>
            </div>
          )}

          {watchActivityType === ActivityType.TEAM_VS && (
            <div className="space-y-4 p-4 bg-[rgb(255,255,255,0.02)] border border-[rgb(255,255,255,0.1)] rounded-lg">
              <h4 className="font-medium text-white">Configurações de Atividade Equipa vs Equipa</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos por Vitória
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.win_points || 30}
                    onChange={(e) => updateConfig("win_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="30"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos por Empate
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.draw_points || 15}
                    onChange={(e) => updateConfig("draw_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="15"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Pontos por Derrota
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={configData.lose_points || 0}
                    onChange={(e) => updateConfig("lose_points", Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <BloodyButton
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? "Salvando..." : initialData ? "Atualizar" : "Criar"}
            </BloodyButton>
            <BloodyButton
              type="button"
              variant="neutral"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Cancelar
            </BloodyButton>
          </div>
        </form>
      </Form>
    </div>
  );
}
