import { useFormContext, Controller, useFieldArray } from "react-hook-form";
import { GripVertical, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HOME_SECTION_LABELS, MAX_TICKER_ITEMS, type HomeSectionKey } from "@/lib/homeLayout";
import React from "react";

type HomeLayoutSettingsProps = Readonly<{
  className?: string;
}>;

interface SortableRowProps {
  readonly id: string;
  readonly children: React.ReactNode;
}

function SortableRow({ id, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export default function HomeLayoutSettings({ className = "" }: HomeLayoutSettingsProps) {
  const { control } = useFormContext();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const {
    fields: tickerFields,
    append: appendTicker,
    remove: removeTicker,
    move: moveTicker,
  } = useFieldArray({ control, name: "ticker_items_list" });

  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <LayoutTemplate className="h-4 w-4" />
          Layout da Página Inicial
        </h3>
        <p className="text-xs text-muted-foreground">
          Escolher que secções aparecem na Início, a sua ordem, e o texto da faixa de destaques
        </p>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Secções</Label>
          <Controller
            name="home_layout"
            control={control}
            render={({ field }) => {
              const sections: { key: HomeSectionKey; visible: boolean }[] = field.value ?? [];

              const handleDragEnd = (event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = sections.findIndex((s) => s.key === active.id);
                const newIndex = sections.findIndex((s) => s.key === over.id);
                if (oldIndex === -1 || newIndex === -1) return;
                field.onChange(arrayMove(sections, oldIndex, newIndex));
              };

              return (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sections.map((s) => s.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {sections.map((section, index) => (
                        <SortableRow key={section.key} id={section.key}>
                          <span className="flex-1 text-sm font-medium">
                            {HOME_SECTION_LABELS[section.key] ?? section.key}
                          </span>
                          <Switch
                            aria-label={`Mostrar secção ${HOME_SECTION_LABELS[section.key] ?? section.key}`}
                            checked={section.visible}
                            onCheckedChange={(checked) => {
                              const next = [...sections];
                              next[index] = { ...section, visible: checked };
                              field.onChange(next);
                            }}
                          />
                        </SortableRow>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              );
            }}
          />
          <p className="text-xs text-muted-foreground">
            Arraste para reordenar. Desligue para esconder uma secção da Início.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Faixa de destaques (ticker)</Label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIndex = tickerFields.findIndex((f) => f.id === active.id);
              const newIndex = tickerFields.findIndex((f) => f.id === over.id);
              if (oldIndex === -1 || newIndex === -1) return;
              moveTicker(oldIndex, newIndex);
            }}
          >
            <SortableContext
              items={tickerFields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {tickerFields.map((field, index) => (
                  <SortableRow key={field.id} id={field.id}>
                    <Controller
                      name={`ticker_items_list.${index}.value`}
                      control={control}
                      render={({ field: textField }) => (
                        <Input
                          aria-label={`Item ${index + 1} da faixa de destaques`}
                          value={textField.value ?? ""}
                          onChange={(e) => textField.onChange(e.target.value)}
                          maxLength={40}
                          className="flex-1"
                        />
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTicker(index)}
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendTicker({ value: "" })}
            disabled={tickerFields.length >= MAX_TICKER_ITEMS}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar item
          </Button>
          <p className="text-xs text-muted-foreground">
            Máximo {MAX_TICKER_ITEMS} itens, 40 caracteres cada.
          </p>
        </div>
      </div>
    </section>
  );
}
