import type { AdminNavGroup } from "../adminNavigation";
import type { AdminTabId } from "@/router/routes";

interface AdminSidebarProps {
  groups: readonly AdminNavGroup[];
  activeTab: AdminTabId;
  disabledTabIds: ReadonlySet<AdminTabId>;
  onSelect: (id: AdminTabId) => void;
}

/** Desktop sticky sidebar: admin nav grouped under secondary-styled headings. */
export default function AdminSidebar({
  groups,
  activeTab,
  disabledTabIds,
  onSelect,
}: AdminSidebarProps) {
  return (
    <nav
      aria-label="Secções de administração"
      className="rally-surface hidden gap-3 p-1.5 lg:sticky lg:top-24 lg:flex lg:flex-col"
    >
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <span className="px-3.5 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </span>
          {group.items.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            const disabled = disabledTabIds.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-current={active ? "page" : undefined}
                className={[
                  "rally-press flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors lg:w-full",
                  active
                    ? "rally-bg-accent text-white"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {disabled && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                    desativado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
