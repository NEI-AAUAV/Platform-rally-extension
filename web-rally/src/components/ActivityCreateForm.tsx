import { useState, useEffect } from "react";
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
import { ActivityConfigFields } from "@/components/activity-form/ActivityConfigFields";
import type { ConfigValue } from "@/components/activity-form/ConfigNumberField";

const activityFormSchema = z.object({
  name: z.string().min(1, "Nome da atividade é obrigatório"),
  description: z.string().optional(),
  activity_type: z.nativeEnum(ActivityType, {
    errorMap: () => ({ message: "Tipo de atividade é obrigatório" }),
  }),
  checkpoint_id: z.number().min(1, "Checkpoint é obrigatório"),
  config: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  is_active: z.boolean().default(true),
});

type ActivityForm = z.infer<typeof activityFormSchema>;

/**
 * Props for ActivityCreateForm component
 */
type ActivityFormProps = Readonly<{
  /** List of available checkpoints to assign the activity to */
  checkpoints: Checkpoint[];
  /** Callback when form is submitted with valid data */
  onSubmit: (data: ActivityCreate) => void;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  isLoading?: boolean;
  /** Error message to display */
  error?: string;
  /** Initial form data for editing existing activities */
  initialData?: Partial<ActivityForm>;
}>;

const activityTypeLabels = {
  [ActivityType.TIME_BASED]: "Baseada em Tempo",
  [ActivityType.SCORE_BASED]: "Baseada em Pontuação",
  [ActivityType.BOOLEAN]: "Sim/Não",
  [ActivityType.TEAM_VS]: "Equipa vs Equipa",
  [ActivityType.GENERAL]: "Geral",
  [ActivityType.DEFERRED_JUDGED]: "Avaliação Posterior (Fotos)",
};

function getSubmitButtonLabel(isLoading: boolean, hasInitialData: boolean): string {
  if (isLoading) return "Salvando...";
  return hasInitialData ? "Atualizar" : "Criar";
}

/**
 * Form component for creating and editing activities
 * 
 * Provides a comprehensive form with:
 * - Activity name and description
 * - Activity type selection
 * - Checkpoint assignment
 * - Type-specific configuration fields
 * - Form validation with error messages
 * 
 * Supports both create and edit modes via initialData prop.
 * 
 * @param props - ActivityFormProps
 * @returns JSX form element
 * 
 * @example
 * ```tsx
 * <ActivityCreateForm
 *   checkpoints={checkpoints}
 *   onSubmit={(data) => createActivity(data)}
 *   onCancel={() => setShowForm(false)}
 *   initialData={editingActivity}
 * />
 * ```
 */

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
  const [configData, setConfigData] = useState<Record<string, ConfigValue>>(initialData?.config ?? {});

  // Synchronize configData with initialData changes (e.g., when switching between create/edit)
  useEffect(() => {
    if (initialData?.config !== undefined) {
      setConfigData(initialData.config);
    }
  }, [initialData?.config]);

  const handleSubmit = (data: ActivityForm) => {
    onSubmit({ ...data, config: configData });
  };

  const updateConfig = (key: string, value: ConfigValue) => {
    setConfigData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">
          {initialData ? "Editar Atividade" : "Criar Nova Atividade"}
        </h3>
        <p className="text-muted-foreground">
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
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
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
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
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
                    className="w-full p-2 bg-muted border border-border rounded text-foreground"
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
                    className="w-full p-2 bg-muted border border-border rounded text-foreground"
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
          <ActivityConfigFields
            activityType={watchActivityType}
            configData={configData}
            updateConfig={updateConfig}
          />

          <div className="flex gap-4 pt-4">
            <BloodyButton
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {getSubmitButtonLabel(isLoading, !!initialData)}
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
