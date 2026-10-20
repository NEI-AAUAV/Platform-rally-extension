import type { AdminNavGroup } from "../adminNavigation";
import type { AdminTabId } from "@/router/routes";

interface AdminSidebarProps {
  readonly groups: readonly AdminNavGroup[];
  readonly activeTab: AdminTabId;
  readonly disabledTabIds: ReadonlySet<AdminTabId>;
  readonly onSelect: (id: AdminTabId) => void;
}

/** Desktop sidebar: admin nav grouped under eyebrow headings; the rail around it is sticky. */
export default function AdminSidebar({
  groups,
  activeTab,
  disabledTabIds,
  onSelect,
}: AdminSidebarProps) {
  return (
    <nav aria-label="Secções de administração" className="hidden gap-5 lg:flex lg:flex-col">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          <span className="rally-eyebrow px-3.5 pb-1 text-[11px]">{group.label}</span>
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
                  "flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors lg:w-full",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
