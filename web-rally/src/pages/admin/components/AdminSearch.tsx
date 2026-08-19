/**
 * Search box for the whole admin area: type a field/setting name, jump
 * straight to its tab (and, for Settings, its section) instead of clicking
 * through 18 tabs looking for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchAdmin, type AdminSearchEntry } from "@/lib/adminSearchIndex";
import { SETTINGS_SECTIONS } from "@/pages/settings/sections";
import type { AdminTabId } from "@/router/routes";

const TAB_LABELS: Readonly<Record<string, string>> = {
  dashboard: "Dashboard",
  teams: "Equipas",
  checkpoints: "Postos",
  activities: "Atividades",
  members: "Membros",
  assignment: "Atribuições",
  "guide-assignment": "Guias",
  evaluation: "Avaliação",
  versus: "Versus",
  judging: "Julgamento",
  badges: "Crachás",
  scoring: "Pontuação",
  branding: "Identidade",
  events: "Edições",
  notifications: "Anúncios",
  settings: "Configurações",
  audit: "Auditoria",
  metrics: "Métricas",
};

type AdminSearchProps = Readonly<{
  onSelect: (entry: AdminSearchEntry) => void;
  /** Restrict results to one tab — used by the standalone Settings page. */
  filterTabId?: AdminTabId;
  placeholder?: string;
}>;

function resultSubtitle(entry: AdminSearchEntry): string {
  if (entry.settingsSectionId) {
    return SETTINGS_SECTIONS.find((s) => s.id === entry.settingsSectionId)?.label ?? entry.tabId;
  }
  return TAB_LABELS[entry.tabId] ?? entry.tabId;
}

export default function AdminSearch({ onSelect, filterTabId, placeholder }: AdminSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const matches = searchAdmin(query, filterTabId ? 20 : 8);
    return filterTabId ? matches.filter((e) => e.tabId === filterTabId).slice(0, 8) : matches;
  }, [query, filterTabId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(entry: AdminSearchEntry) {
    onSelect(entry);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
          placeholder={placeholder ?? "Procurar no admin..."}
          aria-label={placeholder ?? "Procurar no admin"}
          className="pl-8"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {results.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => handleSelect(entry)}
                className={cn(
                  "flex w-full flex-col items-start gap-0 px-3 py-2 text-left text-sm hover:bg-muted",
                )}
              >
                <span className="font-medium">{entry.label}</span>
                <span className="text-xs text-muted-foreground">{resultSubtitle(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query && results.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          Sem resultados.
        </div>
      )}
    </div>
  );
}
