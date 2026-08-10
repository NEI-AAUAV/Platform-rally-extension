import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

type Props = Readonly<{
  counters: readonly PenaltyCounterConfig[];
  onChange: (counters: PenaltyCounterConfig[]) => void;
}>;

/** A key derived from the label: lowercase, spaces to underscores, stripped
 * of anything that isn't a letter/digit/underscore. Not shown to staff —
 * only used as the dict key the penalty is stored under. */
function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics (á -> a)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+/, "")
      .replace(/_+$/, "") || "counter"
  );
}

/** Any per-activity "each miss costs X points" counters — e.g. "cada falha
 * na baliza". Stored in `config.penalty_counters`; the staff evaluation form
 * renders one count input per entry alongside the built-in vomit/not-drinking
 * ones (see PenaltiesFieldset). */
export default function PenaltyCounterConfigFields({ counters, onChange }: Props) {
  const addCounter = () => {
    onChange([...counters, { key: `counter_${counters.length + 1}`, label: "", points: 5 }]);
  };

  const updateCounter = (index: number, patch: Partial<PenaltyCounterConfig>) => {
    const next = counters.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  const removeCounter = (index: number) => {
    onChange(counters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <div>
        <h4 className="font-medium text-foreground">Contadores de falhas (opcional)</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Para desafios do tipo "cada falha bebe": o staff regista quantas vezes aconteceu, e cada
          uma desconta os pontos definidos aqui.
        </p>
      </div>

      {counters.map(
        (
          counter,
          index, // NOSONAR
        ) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label
                htmlFor={`penalty-counter-label-${index}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                Nome
              </label>
              <Input
                id={`penalty-counter-label-${index}`}
                value={counter.label}
                placeholder="Ex: Falha na baliza"
                onChange={(e) =>
                  updateCounter(index, {
                    label: e.target.value,
                    key: slugify(e.target.value),
                  })
                }
                className="border-border bg-card"
              />
            </div>
            <div className="w-28">
              <label
                htmlFor={`penalty-counter-points-${index}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                Pontos cada
              </label>
              <Input
                id={`penalty-counter-points-${index}`}
                type="number"
                min={0}
                value={counter.points}
                onChange={(e) =>
                  updateCounter(index, { points: Number.parseInt(e.target.value, 10) || 0 })
                }
                className="border-border bg-card"
              />
            </div>
            <BloodyButton
              type="button"
              variant="neutral"
              onClick={() => removeCounter(index)}
              aria-label={`Remover contador ${counter.label || index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </BloodyButton>
          </div>
        ),
      )}

      <BloodyButton type="button" variant="neutral" onClick={addCounter}>
        <Plus className="h-4 w-4" />
        <span className="ml-1.5">Adicionar contador</span>
      </BloodyButton>
    </div>
  );
}
