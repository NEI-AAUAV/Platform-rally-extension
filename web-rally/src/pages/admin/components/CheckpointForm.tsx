import type { UseFormReturn } from "react-hook-form";
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
import type { CheckpointForm as CheckpointFormValues } from "./useCheckpointManagement";

const fieldClassName = "bg-muted border-border";

type CheckpointFormProps = Readonly<{
  form: UseFormReturn<CheckpointFormValues>;
  isEditing: boolean;
  isSubmitting: boolean;
  onSubmit: (data: CheckpointFormValues) => void;
  onCancel: () => void;
}>;

export default function CheckpointForm({
  form,
  isEditing,
  isSubmitting,
  onSubmit,
  onCancel,
}: CheckpointFormProps) {
  return (
    <div className="rally-surface rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-4">
        {isEditing ? 'Editar Checkpoint' : 'Criar Novo Checkpoint'}
      </h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Checkpoint</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Checkpoint Central" {...field} className={fieldClassName} />
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
                  <Input placeholder="Descrição do checkpoint..." {...field} className={fieldClassName} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="latitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 40.6405" {...field} className={fieldClassName} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="longitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: -8.6538" {...field} className={fieldClassName} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ordem do Checkpoint</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Ex: 1"
                    {...field}
                    onChange={(e) => field.onChange(Number.parseInt(e.target.value) || 0)}
                    className={fieldClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <BloodyButton type="submit" disabled={isSubmitting}>
              {isEditing ? 'Atualizar' : 'Criar'} Checkpoint
            </BloodyButton>
            {isEditing && (
              <BloodyButton type="button" variant="neutral" onClick={onCancel}>
                Cancelar
              </BloodyButton>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
