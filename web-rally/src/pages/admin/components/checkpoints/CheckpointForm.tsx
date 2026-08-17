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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { RouteStageResponse } from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import type { Checkpoint, CheckpointForm as CheckpointFormValues } from "./useCheckpointManagement";
import CheckpointLocationPicker from "./CheckpointLocationPicker";
import ClueImageField from "./ClueImageField";

const fieldClassName = "bg-muted border-border";

type SectionProps = Readonly<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}>;

/**
 * A post is written in passes — first where it is, later what happens there —
 * so the form is grouped by which pass a field belongs to rather than listing
 * thirteen inputs in one column.
 */
function Section({ title, hint, children }: SectionProps) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border p-4">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

type CheckpointFormProps = Readonly<{
  form: UseFormReturn<CheckpointFormValues>;
  isEditing: boolean;
  isSubmitting: boolean;
  onSubmit: (data: CheckpointFormValues) => void;
  onCancel: () => void;
  checkpoints?: ReadonlyArray<Checkpoint>;
  currentId?: number | null;
  stages?: ReadonlyArray<RouteStageResponse>;
  pendingClueImage?: File | null;
  onPendingClueImageChange?: (file: File | null) => void;
}>;

export default function CheckpointForm({
  form,
  isEditing,
  isSubmitting,
  onSubmit,
  onCancel,
  checkpoints,
  currentId,
  stages,
  pendingClueImage,
  onPendingClueImageChange,
}: CheckpointFormProps) {
  return (
    <div className="rally-surface rounded-2xl p-6">
      <h3 className="mb-1 text-lg font-semibold">
        {isEditing ? "Editar Checkpoint" : "Criar Novo Checkpoint"}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Só o nome é obrigatório. Um posto com nome e mais nada é um rascunho legítimo — a lista
        abaixo mostra o que ainda falta.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Section title="Identificação">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Checkpoint</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Checkpoint Central"
                      {...field}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_placeholder"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel>Nome provisório</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Para postos ainda por decidir ("Bar 1"). Aparece na lista como pendente até o
                      sítio estar escolhido.
                    </p>
                  </div>
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
                      placeholder="Descrição do checkpoint..."
                      {...field}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          <Section
            title="Onde é"
            hint="Clica no mapa para definir as coordenadas, ou escreve-as à mão."
          >
            <CheckpointLocationPicker
              latitude={
                form.watch("latitude") ? Number.parseFloat(form.watch("latitude") as string) : null
              }
              longitude={
                form.watch("longitude")
                  ? Number.parseFloat(form.watch("longitude") as string)
                  : null
              }
              onChange={(lat, lng) => {
                form.setValue("latitude", lat.toFixed(6), { shouldValidate: true });
                form.setValue("longitude", lng.toFixed(6), { shouldValidate: true });
              }}
              checkpoints={checkpoints}
              currentId={currentId}
              radiusM={form.watch("arrival_radius_m")}
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
              name="arrival_radius_m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raio de chegada (metros)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Ex: 50"
                      {...field}
                      onChange={(e) => field.onChange(Number.parseInt(e.target.value) || 0)}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Distância a que a equipa tem de estar para "adivinhar" o sítio via GPS. 0
                    desativa o check-in por localização.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          <Section
            title="O que a equipa vê"
            hint="Com a rota tapada, isto é tudo o que é enviado antes do check-in."
          >
            <FormField
              control={form.control}
              name="clue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enigma para a equipa (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Ex: Onde o rio encontra a ponte de ferro..."
                      {...field}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Mostrado à equipa <strong>antes</strong> de chegar — a resposta é este local.
                    Deixa vazio para o evento correr guiado, com as indicações dadas pelo guia no
                    local.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Imagem do enigma (opcional)</FormLabel>
              <p className="text-xs text-muted-foreground">
                Uma foto-enigma — um detalhe do local, por exemplo.
              </p>
              <ClueImageField
                checkpointId={currentId ?? null}
                currentUrl={form.watch("clue_media_url") || null}
                onUploaded={(url) => form.setValue("clue_media_url", url)}
                pendingFile={pendingClueImage}
                onFileSelected={onPendingClueImageChange}
              />
            </FormItem>
          </Section>

          <Section
            title="O que o staff usa"
            hint="Nunca chega a uma equipa: estes campos não existem no schema que serve os participantes."
          >
            <FormField
              control={form.control}
              name="staff_script"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guião do staff (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Ex: Falar dos diferentes desportos em que se podem inscrever..."
                      {...field}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Os assuntos a abordar com as equipas neste posto. Ao contrário das indicações do
                    guia, <strong>não</strong> é vendido como pista.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="challenge_brief"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desafio em texto (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Ex: Pirâmide humana. Depois, dois shots por equipa..."
                      {...field}
                      className={fieldClassName}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    O desafio tal como foi pensado, antes de existir uma atividade configurada.
                    Serve para não perder a ideia enquanto o posto está a ser planeado.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          <Section
            title="Quando entra na rota"
            hint="A posição na rota define-se arrastando os postos na lista abaixo."
          >
            <FormField
              control={form.control}
              name="stage_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa</FormLabel>
                  {stages && stages.length > 0 ? (
                    <>
                      <FormControl>
                        <select
                          {...field}
                          className="h-10 w-full rounded-md border border-border bg-muted px-3 text-sm"
                        >
                          <option value="">Sem etapa</option>
                          {stages.map((stage) => (
                            <option key={stage.id} value={String(stage.id)}>
                              {stage.order}. {stage.name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        A etapa manda na ordem: mudar de etapa renumera o posto dentro da rota.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ainda não criaste nenhuma etapa — cria uma em "Etapas da rota" acima para
                      poderes atribuir postos a ela. Sem etapas, a rota corre como um bloco só.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="available_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Abre a (opcional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} className={fieldClassName} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="available_until"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha a (opcional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} className={fieldClassName} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Fora desta janela o posto recusa check-ins e diz à equipa a que horas abre. Vazio =
              está sempre aberto.
            </p>
          </Section>

          <Section title="Estado">
            <FormField
              control={form.control}
              name="is_draft"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel>Rascunho</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Fica fora da rota: as equipas não o veem, não conta para o total e nunca é
                      entregue como próximo posto. Depois de as equipas arrancarem, deixa de ser
                      possível mudar isto.
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </Section>

          <div className="flex gap-2">
            <BloodyButton type="submit" disabled={isSubmitting}>
              {isEditing ? "Atualizar" : "Criar"} Checkpoint
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
