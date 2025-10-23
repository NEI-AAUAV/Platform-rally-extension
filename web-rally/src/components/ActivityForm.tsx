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

const activityFormSchema = z.object({
  name: z.string().min(1, "Nome da atividade é obrigatório"),
  description: z.string().optional(),
  activity_type: z.nativeEnum(ActivityType, {
    errorMap: () => ({ message: "Tipo de atividade é obrigatório" }),
  }),
  checkpoint_id: z.number().min(1, "Checkpoint é obrigatório"),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().default(true),
  order: z.number().min(0).default(0),
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
      order: 0,
      ...initialData,
    },
  });

  const handleSubmit = (data: ActivityForm) => {
    onSubmit(data);
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
            name="activity_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Atividade</FormLabel>
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
            name="order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ordem</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white placeholder:text-[rgb(255,255,255,0.5)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
