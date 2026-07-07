import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ImagePlus, Loader2 } from "lucide-react";
import { getActivities, getCheckpoints, type BadgeDefinitionResponse } from "@/client";
import { useBadgeDefinitionMutations } from "@/hooks/useBadgeAdmin";
import { apiErrorMessage } from "@/lib/apiError";
import { TRIGGERS, triggerMeta } from "@/lib/badgeTriggers";
import { BADGE_FALLBACK } from "@/lib/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BadgeFormProps {
  readonly editing: BadgeDefinitionResponse | null;
  readonly onDone: () => void;
}

function stringifyCriteriaId(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

interface FormState {
  code: string;
  name: string;
  description: string;
  color: string;
  glyph: string;
  isAuto: boolean;
  triggerType: string; // "" = manual only
  criteriaActivityId: string; // "" = any
  criteriaCheckpointId: string; // "" = any
  criteriaNumber: string; // count / min_score / max_seconds, "" = unset
}

function initialState(editing: BadgeDefinitionResponse | null): FormState {
  const criteria = (editing?.criteria ?? {}) as Record<string, unknown>;
  // Only one numeric criteria key is ever present per trigger.
  const numberValue = criteria.count ?? criteria.min_score ?? criteria.max_seconds;
  return {
    code: editing?.code ?? "",
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    color: editing?.color ?? BADGE_FALLBACK.color,
    glyph: editing?.glyph ?? "",
    isAuto: editing?.is_auto ?? false,
    triggerType: editing?.trigger_type ?? "",
    criteriaActivityId: stringifyCriteriaId(criteria.activity_id),
    criteriaCheckpointId: stringifyCriteriaId(criteria.checkpoint_id),
    criteriaNumber: stringifyCriteriaId(numberValue),
  };
}

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function BadgeForm({ editing, onDone }: BadgeFormProps) {
  const isEdit = editing != null;
  const [form, setForm] = useState<FormState>(() => initialState(editing));
  const [iconFile, setIconFile] = useState<File | null>(null);
  const { create, update, uploadIcon } = useBadgeDefinitionMutations();

  useEffect(() => {
    setForm(initialState(editing));
    setIconFile(null);
  }, [editing]);

  const selectedTrigger = triggerMeta(form.triggerType);

  const { data: activityList } = useQuery({
    queryKey: ["activities", "all"],
    queryFn: async () => {
      const { data } = await getActivities({ query: { skip: 0, limit: 200 } });
      return data;
    },
    enabled: form.isAuto && selectedTrigger?.param === "activity",
  });
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data;
    },
    enabled: form.isAuto && selectedTrigger?.param === "checkpoint",
  });

  const activities = activityList?.activities ?? [];

  const buildCriteria = (): Record<string, unknown> => {
    if (!form.isAuto || !selectedTrigger) return {};
    const criteria: Record<string, unknown> = {};
    if (selectedTrigger.param === "activity" && form.criteriaActivityId) {
      criteria.activity_id = Number(form.criteriaActivityId);
    }
    if (selectedTrigger.param === "checkpoint" && form.criteriaCheckpointId) {
      criteria.checkpoint_id = Number(form.criteriaCheckpointId);
    }
    if (selectedTrigger.numberParam && form.criteriaNumber.trim() !== "") {
      criteria[selectedTrigger.numberParam.key] = Number(form.criteriaNumber);
    }
    return criteria;
  };

  const mutation = isEdit ? update : create;
  const errorMessage =
    mutation.isError && apiErrorMessage(mutation.error, "Erro ao gravar crachá.");

  // An auto badge must pick a trigger, and any trigger with a required numeric
  // criterion must have that value filled in.
  const autoValid =
    !form.isAuto ||
    (!!selectedTrigger && (!selectedTrigger.numberParam || form.criteriaNumber.trim() !== ""));
  const canSubmit = Boolean(form.name.trim() && (isEdit || form.code.trim()) && autoValid);

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      glyph: form.glyph.trim() || null,
      is_auto: form.isAuto,
      trigger_type: form.isAuto && form.triggerType ? form.triggerType : null,
      criteria: buildCriteria(),
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, data: payload });
        if (iconFile) {
          await uploadIcon.mutateAsync({ id: editing!.id, image: iconFile });
        }
      } else {
        const created = await create.mutateAsync({
          ...payload,
          code: form.code.trim().toLowerCase(),
        });
        if (iconFile && created?.id != null) {
          await uploadIcon.mutateAsync({ id: created.id, image: iconFile });
        }
      }
      onDone();
    } catch {
      // error surfaced via mutation.isError / errorMessage
    }
  };

  const preview = useMemo(() => {
    if (iconFile) return URL.createObjectURL(iconFile);
    return editing?.icon_url ?? null;
  }, [iconFile, editing?.icon_url]);

  return (
    <div className="rally-surface space-y-4 p-4">
      <p className="text-sm font-semibold">{isEdit ? "Editar crachá" : "Criar crachá"}</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Código único *</span>
          <input
            className={inputClass}
            placeholder="ex: first_arrival"
            value={form.code}
            disabled={isEdit}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          {isEdit && (
            <span className="text-[10px] text-muted-foreground">
              O código não pode ser alterado.
            </span>
          )}
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Nome *</span>
          <input
            className={inputClass}
            placeholder="Nome do crachá"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Descrição</span>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Descrição opcional…"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>

      {/* visual */}
      <div className="grid grid-cols-[auto_auto_1fr] items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Cor</span>
          <input
            type="color"
            className="h-10 w-14 cursor-pointer rounded-lg border bg-background"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Emoji</span>
          <input
            className={`${inputClass} w-16 text-center text-lg`}
            maxLength={2}
            placeholder={BADGE_FALLBACK.glyph}
            value={form.glyph}
            onChange={(e) => setForm({ ...form, glyph: e.target.value })}
          />
        </label>
        <div className="flex items-center gap-3">
          {/* live preview tile */}
          {preview ? (
            <img src={preview} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div
              className="grid h-12 w-12 place-items-center rounded-xl text-xl text-white"
              style={{ background: form.color }}
              aria-hidden
            >
              {form.glyph || BADGE_FALLBACK.glyph}
            </div>
          )}
          <label className="rally-press flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium">
            <ImagePlus className="h-4 w-4" />
            {iconFile ? "Trocar imagem" : "Carregar imagem"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Uma imagem carregada substitui a cor + emoji no showcase.
      </p>

      {/* behaviour */}
      <div className="space-y-3 rounded-lg border border-dashed p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.isAuto}
            onChange={(e) => setForm({ ...form, isAuto: e.target.checked })}
          />
          Atribuição automática (programável)
        </label>

        {form.isAuto && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Condição de atribuição *</span>
              <Select
                value={form.triggerType || undefined}
                onValueChange={(v) => setForm({ ...form, triggerType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher condição…" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTrigger && (
                <span className="text-[11px] text-muted-foreground">{selectedTrigger.help}</span>
              )}
            </label>

            {selectedTrigger?.param === "activity" && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Atividade (opcional — vazio = qualquer)
                </span>
                <Select
                  value={form.criteriaActivityId || "__any__"}
                  onValueChange={(v) =>
                    setForm({ ...form, criteriaActivityId: v === "__any__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer atividade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer atividade</SelectItem>
                    {activities.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}

            {selectedTrigger?.param === "checkpoint" && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Posto (opcional — vazio = qualquer)
                </span>
                <Select
                  value={form.criteriaCheckpointId || "__any__"}
                  onValueChange={(v) =>
                    setForm({ ...form, criteriaCheckpointId: v === "__any__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer posto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer posto</SelectItem>
                    {(checkpoints ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}

            {selectedTrigger?.numberParam && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  {selectedTrigger.numberParam.label} *
                </span>
                <input
                  type="number"
                  className={inputClass}
                  min={selectedTrigger.numberParam.min}
                  placeholder={selectedTrigger.numberParam.placeholder}
                  value={form.criteriaNumber}
                  onChange={(e) => setForm({ ...form, criteriaNumber: e.target.value })}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="rally-press flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          disabled={!canSubmit || mutation.isPending || uploadIcon.isPending}
          onClick={handleSubmit}
        >
          {(mutation.isPending || uploadIcon.isPending) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {isEdit ? "Guardar" : "Criar"}
        </button>
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
          onClick={onDone}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
