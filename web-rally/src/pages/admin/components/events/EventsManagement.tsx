import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CalendarRange,
  Check,
  Plus,
  Star,
  Pencil,
  X,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
} from "lucide-react";
import { generateRotationSchedule } from "@/client";
import { downloadEventResults, downloadEventReport } from "@/services/eventExport";
import RotationScheduleView from "./RotationScheduleView";
import { EmptyState, LoadingState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { useEvents, useEventMutations } from "@/hooks/useEvents";
import { EVENT_TYPE_LABELS, type EventType, type RallyEvent } from "@/types/event";
import {
  utcISOStringToLocalDatetimeLocal,
  localDatetimeLocalToUTCISOString,
} from "@/utils/timezone";

interface FormState {
  name: string;
  event_type: EventType;
  description: string;
  start_time: string;
  end_time: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  event_type: "rally_tascas",
  description: "",
  start_time: "",
  end_time: "",
};

function toForm(ev: RallyEvent): FormState {
  return {
    name: ev.name,
    event_type: ev.event_type,
    description: ev.description ?? "",
    start_time: ev.start_time ? (utcISOStringToLocalDatetimeLocal(ev.start_time) ?? "") : "",
    end_time: ev.end_time ? (utcISOStringToLocalDatetimeLocal(ev.end_time) ?? "") : "",
  };
}

function formatRange(ev: RallyEvent): string | null {
  if (!ev.start_time) return null;
  const start = new Date(ev.start_time).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (!ev.end_time) return start;
  const end = new Date(ev.end_time).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

type ScheduleRounds = ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;

function generateButtonLabel(isPending: boolean, hasRounds: boolean): string {
  if (isPending) return "A gerar…";
  return hasRounds ? "Regenerar escalonamento" : "Gerar escalonamento";
}

function ExportResultsButton({ event }: Readonly<{ event: RallyEvent }>) {
  const toast = useAppToast();
  const exportMutation = useMutation({
    mutationFn: () => downloadEventResults(event.id, event.name),
    onSuccess: () => toast.success("Resultados exportados"),
    onError: (err) => toast.error(getErrorMessage(err, "Erro ao exportar resultados")),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={exportMutation.isPending}
      onClick={() => exportMutation.mutate()}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {exportMutation.isPending ? "A exportar…" : "Exportar resultados"}
    </Button>
  );
}

function ReportButton({ event }: Readonly<{ event: RallyEvent }>) {
  const toast = useAppToast();
  const reportMutation = useMutation({
    mutationFn: () => downloadEventReport(event.id, event.name),
    onSuccess: () => toast.success("Relatório gerado"),
    onError: (err) => toast.error(getErrorMessage(err, "Erro ao gerar relatório")),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reportMutation.isPending}
      onClick={() => reportMutation.mutate()}
    >
      <FileText className="mr-1.5 h-3.5 w-3.5" />
      {reportMutation.isPending ? "A gerar…" : "Relatório (PDF)"}
    </Button>
  );
}

function RotationScheduleButton({ eventId }: Readonly<{ eventId: number }>) {
  const toast = useAppToast();
  const [rounds, setRounds] = useState<ScheduleRounds | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await generateRotationSchedule({ path: { event_id: eventId } });
      return data;
    },
    onSuccess: (data) => {
      setRounds(data?.rounds ?? []);
      toast.success("Escalonamento olímpico gerado");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Erro ao gerar escalonamento")),
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isError ? (
            <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-red-500" />
          ) : (
            <Shuffle className="mr-1.5 h-3.5 w-3.5" />
          )}
          {generateButtonLabel(generateMutation.isPending, Boolean(rounds))}
        </Button>
        {rounds && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> {rounds.length} rondas
          </span>
        )}
      </div>
      {rounds && <RotationScheduleView rounds={rounds} />}
    </div>
  );
}

/**
 * Admin events (editions) management: list editions, switch the current one,
 * create and edit. Soft-depth styling.
 */
export default function EventsManagement() {
  const toast = useAppToast();
  const { data: events, isLoading, isError } = useEvents();
  const { create, update, setCurrent } = useEventMutations();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (ev: RallyEvent) => {
    setForm(toForm(ev));
    setEditingId(ev.id);
    setShowForm(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("O nome do evento é obrigatório");
      return;
    }
    const body = {
      name: form.name.trim(),
      event_type: form.event_type,
      description: form.description.trim() || null,
      start_time: form.start_time ? localDatetimeLocalToUTCISOString(form.start_time) : null,
      end_time: form.end_time ? localDatetimeLocalToUTCISOString(form.end_time) : null,
    };

    const onError = (err: unknown) => toast.error(getErrorMessage(err, "Erro ao guardar evento"));

    if (editingId != null) {
      update.mutate(
        { id: editingId, body },
        {
          onSuccess: () => {
            toast.success("Evento atualizado");
            resetForm();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success("Evento criado");
          resetForm();
        },
        onError,
      });
    }
  };

  const handleSetCurrent = (ev: RallyEvent) => {
    if (ev.is_current) return;
    setCurrent.mutate(ev.id, {
      onSuccess: () => toast.success(`"${ev.name}" é agora a edição atual`),
      onError: (err) => toast.error(getErrorMessage(err, "Erro ao mudar de edição")),
    });
  };

  if (isLoading) return <LoadingState message="A carregar eventos..." />;

  const list = events ?? [];
  const isSaving = create.isPending || update.isPending;

  let eventsContent;
  if (isError) {
    eventsContent = (
      <div className="rally-surface rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar as edições.</p>
      </div>
    );
  } else if (list.length === 0) {
    eventsContent = (
      <EmptyState
        icon={<CalendarRange className="h-8 w-8 text-muted-foreground" />}
        title="Sem edições"
        description="Cria a primeira edição do rally."
      />
    );
  } else {
    eventsContent = (
      <div className="grid gap-3">
        {list.map((ev) => (
          <div key={ev.id} className="rally-surface rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="rally-display truncate text-lg font-bold text-foreground">
                    {ev.name}
                  </h3>
                  {ev.is_current && (
                    <span className="rally-bg-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Star className="h-3 w-3" /> Atual
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {EVENT_TYPE_LABELS[ev.event_type]}
                  {formatRange(ev) ? ` · ${formatRange(ev)}` : ""}
                </p>
                {ev.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{ev.description}</p>
                )}
              </div>
              {/* w-full on mobile: a `shrink-0` box sizes to its unwrapped
                  content width, so `flex-wrap` on it alone is a no-op once
                  there are enough buttons — the row just overflows the card
                  sideways instead of wrapping. Forcing the full card width
                  here gives it something to actually wrap against; sm+
                  reverts to shrink-to-content since there's room to sit
                  beside the title there. */}
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                <ExportResultsButton event={ev} />
                <ReportButton event={ev} />
                {ev.event_type === "olympic" && <RotationScheduleButton eventId={ev.id} />}
                {!ev.is_current && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetCurrent(ev)}
                    disabled={setCurrent.isPending}
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" /> Tornar atual
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => startEdit(ev)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="rally-display text-xl font-bold">Edições</h2>
          <p className="text-sm text-muted-foreground">
            Cria, edita e troca a edição atual sem apagar dados.
          </p>
        </div>
        {!showForm && (
          <Button
            variant="default"
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditingId(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rally-surface rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-admin-search-key="ev-name" className="space-y-1.5">
                <Label htmlFor="ev-name">Nome</Label>
                <Input
                  id="ev-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Rally 2024"
                  required
                />
              </div>
              <div data-admin-search-key="ev-type" className="space-y-1.5">
                <Label htmlFor="ev-type">Tipo</Label>
                <Select
                  value={form.event_type}
                  onValueChange={(v) => setForm({ ...form, event_type: v as EventType })}
                >
                  <SelectTrigger id="ev-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {EVENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div data-admin-search-key="ev-start" className="space-y-1.5">
                <Label htmlFor="ev-start">Início</Label>
                <Input
                  id="ev-start"
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div data-admin-search-key="ev-end" className="space-y-1.5">
                <Label htmlFor="ev-end">Fim</Label>
                <Input
                  id="ev-end"
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div data-admin-search-key="ev-desc" className="space-y-1.5">
              <Label htmlFor="ev-desc">Descrição</Label>
              <Input
                id="ev-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button type="submit" variant="default" disabled={isSaving}>
                <Check className="mr-2 h-4 w-4" />
                {editingId != null ? "Guardar" : "Criar"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {eventsContent}
    </div>
  );
}
