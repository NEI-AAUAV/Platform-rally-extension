/**
 * Admin editor for the public /rules page.
 *
 * Two independent write paths, deliberately kept apart:
 *  - The section list (rules_sections) is a plain field array, saved with
 *    the rest of the settings form (see ../index.tsx) — same as every other
 *    setting on this page. Every section is fully authored here: title,
 *    icon, and body. Nothing on /rules is hardcoded any more.
 *  - The regulation PDF is uploaded straight to R2 the moment a file is
 *    picked, mirroring the favicon/banner/logo upload pattern in
 *    admin/components/branding/BrandingSettings.tsx (self-contained
 *    useMutation, not part of the form's Save button).
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormContext, useFieldArray, useController } from "react-hook-form";
import { FileText, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { viewRallySettings, uploadRallyRulesPdf, type RallySettingsResponse } from "@/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { cn } from "@/lib/utils";
import { DEFAULT_RULE_SECTION_ICON, RULE_SECTION_ICON_OPTIONS } from "@/lib/ruleSectionIcons";
import { SettingGroup } from "./SettingFields";

const ADMIN_KEY = ["rallySettings-admin"] as const;
const MAX_RULE_SECTIONS = 30;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 4000;

function newSectionId(): string {
  return globalThis.crypto.randomUUID();
}

function SortableSection({
  id,
  index,
  onRemove,
}: Readonly<{ id: string; index: number; onRemove: () => void }>) {
  const { control, register } = useFormContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "space-y-3 rounded-xl border border-border bg-muted/40 p-4",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground"
          aria-label="Reordenar secção"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          aria-label="Título da secção"
          placeholder="Título"
          maxLength={MAX_TITLE_LENGTH}
          {...register(`rules_sections.${index}.title`)}
          className="flex-1 border-border bg-background"
        />
        <IconSelect control={control} name={`rules_sections.${index}.icon`} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Remover secção"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        aria-label="Texto da secção"
        placeholder="Texto desta secção…"
        rows={4}
        maxLength={MAX_BODY_LENGTH}
        {...register(`rules_sections.${index}.body`)}
        className="border-border bg-background"
      />
    </div>
  );
}

function IconSelect({
  control,
  name,
}: Readonly<{ control: ReturnType<typeof useFormContext>["control"]; name: string }>) {
  const { field } = useController({ control, name, defaultValue: DEFAULT_RULE_SECTION_ICON });
  return (
    <Select value={field.value || DEFAULT_RULE_SECTION_ICON} onValueChange={field.onChange}>
      <SelectTrigger
        aria-label="Ícone da secção"
        className="w-36 shrink-0 border-border bg-background"
      >
        <SelectValue placeholder="Ícone" />
      </SelectTrigger>
      <SelectContent>
        {RULE_SECTION_ICON_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RulesPdfUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => (await viewRallySettings()).data,
    staleTime: 5 * 60 * 1000,
  });

  const [fileName, setFileName] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    void queryClient.invalidateQueries({ queryKey: ["rallySettings-public"] });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File) => {
      const { data } = await uploadRallyRulesPdf({ body: { image: file } });
      return data as RallySettingsResponse;
    },
    onSuccess: () => {
      toast.success("Regulamento atualizado com sucesso!");
      setFileName(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao carregar o regulamento"));
      setFileName(null);
    },
  });

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    mutate(file);
    event.target.value = "";
  };

  const currentUrl = settings?.rules_pdf_url;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold">Regulamento oficial (PDF)</h4>
        <p className="text-xs text-muted-foreground">
          Documento completo, opcional · PDF · máx 15MB
        </p>
        {currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rally-accent mt-1 inline-block text-xs font-medium underline underline-offset-2"
          >
            Ver regulamento atual
          </a>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Nenhum regulamento carregado.</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleSelect}
        disabled={isPending}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" />
        {isPending ? "A carregar..." : currentUrl ? "Substituir" : "Carregar"}
      </Button>
      {fileName && isPending && (
        <span className="max-w-[10rem] truncate text-xs text-muted-foreground">{fileName}</span>
      )}
    </div>
  );
}

export default function RulesSettings() {
  const { control } = useFormContext();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const { fields, append, remove, move } = useFieldArray({ control, name: "rules_sections" });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    move(oldIndex, newIndex);
  };

  return (
    <div className="space-y-8">
      <SettingGroup
        title="Secções"
        description="Cada secção da página /regras: título, ícone e texto, totalmente editáveis. Arraste para reordenar."
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="space-y-3 py-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <SortableSection
                    key={field.id}
                    id={field.id}
                    index={index}
                    onRemove={() => remove(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma secção ainda — a página /regras mostra um texto inicial até criares a
              primeira.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fields.length >= MAX_RULE_SECTIONS}
            onClick={() =>
              append({
                id: newSectionId(),
                title: "",
                icon: DEFAULT_RULE_SECTION_ICON,
                body: "",
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar secção
          </Button>
          <p className="text-xs text-muted-foreground">Máximo {MAX_RULE_SECTIONS} secções.</p>
        </div>
      </SettingGroup>

      <RulesPdfUpload />
    </div>
  );
}
