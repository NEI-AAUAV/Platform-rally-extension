import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { listAuditLog, type AuditLogEntry } from "@/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 50;

// Radix Select reserves value="" for clearing the selection, so an "all"
// sentinel stands in for "no filter" and is mapped back to undefined below.
const ALL = "all";

// Broad category prefixes for the filter dropdown — the endpoint matches by
// prefix, so "badge." also covers "badge.granted" and "badge.revoked".
const ACTION_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL, label: "Todas as ações" },
  { value: "rally_settings.", label: "Configurações" },
  { value: "badge.", label: "Crachás" },
  { value: "staff_assignment.", label: "Atribuições de staff" },
  { value: "checkin.", label: "Check-ins" },
  { value: "export.", label: "Exportações" },
];

const TARGET_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL, label: "Todos os alvos" },
  { value: "rally_settings", label: "Configurações" },
  { value: "team_badge", label: "Crachás de equipa" },
  { value: "user", label: "Utilizador" },
  { value: "team", label: "Equipa" },
  { value: "rally_event", label: "Edição do rally" },
];

const ACTOR_KIND_LABELS: Record<string, string> = {
  staff: "Staff",
  team: "Equipa",
  system: "Sistema",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangesSummary({ changes }: Readonly<{ changes: Record<string, unknown> }>) {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.map(([field, diff]) => {
        const { before, after } =
          diff && typeof diff === "object"
            ? (diff as { before?: unknown; after?: unknown })
            : { before: undefined, after: undefined };
        return (
          <div key={field} className="flex flex-wrap items-center gap-1 text-xs">
            <span className="font-medium text-muted-foreground">{field}:</span>
            <span className="text-red-400 line-through">{formatValue(before)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-green-400">{formatValue(after)}</span>
          </div>
        );
      })}
    </div>
  );
}

function AuditRow({ entry }: Readonly<{ entry: AuditLogEntry }>) {
  const when = new Date(entry.created_at).toLocaleString("pt-PT", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
          {entry.action}
        </span>
        <span className="text-xs text-muted-foreground">
          {entry.target_type}
          {entry.target_id ? `#${entry.target_id}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          por {entry.actor_name ?? "desconhecido"}
          {entry.actor_kind && ` (${ACTOR_KIND_LABELS[entry.actor_kind] ?? entry.actor_kind})`}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{when}</span>
      </div>
      {entry.note && <p className="mt-1.5 text-xs italic text-foreground">"{entry.note}"</p>}
      <ChangesSummary changes={(entry.changes ?? {}) as Record<string, unknown>} />
    </div>
  );
}

export default function AuditLogTab() {
  const [action, setAction] = useState(ALL);
  const [targetType, setTargetType] = useState(ALL);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["audit-log", action, targetType, since, until, offset],
    queryFn: async () => {
      const { data: rows } = await listAuditLog({
        query: {
          action: action === ALL ? undefined : action,
          target_type: targetType === ALL ? undefined : targetType,
          since: since ? new Date(since).toISOString() : undefined,
          until: until ? new Date(until).toISOString() : undefined,
          limit: PAGE_SIZE,
          offset,
        },
      });
      return rows ?? [];
    },
    placeholderData: (prev) => prev,
  });

  const entries = data ?? [];
  const resetPage = () => setOffset(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h2 className="rally-display text-lg font-bold text-foreground">Auditoria</h2>
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Filters */}
      <div className="rally-surface flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </div>
        <div className="min-w-[180px]">
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              resetPage();
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Select
            value={targetType}
            onValueChange={(v) => {
              setTargetType(v);
              resetPage();
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Alvo" />
            </SelectTrigger>
            <SelectContent>
              {TARGET_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-since" className="text-[11px] text-muted-foreground">
            Desde
          </label>
          <Input
            id="audit-since"
            type="datetime-local"
            className="h-9 text-xs"
            value={since}
            onChange={(e) => {
              setSince(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-until" className="text-[11px] text-muted-foreground">
            Até
          </label>
          <Input
            id="audit-until"
            type="datetime-local"
            className="h-9 text-xs"
            value={until}
            onChange={(e) => {
              setUntil(e.target.value);
              resetPage();
            }}
          />
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />A carregar…
        </div>
      ) : isError ? (
        <p className="py-6 text-sm text-red-400">Não foi possível carregar a auditoria.</p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Sem registos para os filtros atuais.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={offset === 0}
          className="rally-press flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Anterior
        </button>
        <span className="text-xs text-muted-foreground">
          {offset + 1}–{offset + entries.length}
        </span>
        <button
          type="button"
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={entries.length < PAGE_SIZE}
          className="rally-press flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Seguinte
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
