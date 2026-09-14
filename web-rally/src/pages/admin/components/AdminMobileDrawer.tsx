import { useRef, useState } from "react";
import { Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import useClickOutside from "@/hooks/useClickOutside";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import type { AdminNavGroup } from "../adminNavigation";
import type { AdminTabId } from "@/router/routes";

interface AdminMobileDrawerProps {
  groups: readonly AdminNavGroup[];
  activeTab: AdminTabId;
  activeTabLabel: string;
  activeTabIcon: LucideIcon;
  disabledTabIds: ReadonlySet<AdminTabId>;
  onSelect: (id: AdminTabId) => void;
}

/**
 * Mobile nav: a button opens a drawer listing admin sections as collapsible
 * groups (native <details>/<summary> — no accordion dependency needed). The
 * "overview" group (Dashboard) renders flat above the groups since it's a
 * single item and should stay the easiest one to find.
 */
export default function AdminMobileDrawer({
  groups,
  activeTab,
  activeTabLabel,
  activeTabIcon: ActiveIcon,
  disabledTabIds,
  onSelect,
}: AdminMobileDrawerProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  useClickOutside(drawerRef, isDrawerOpen, () => setIsDrawerOpen(false));
  useBackDismiss(isDrawerOpen, () => setIsDrawerOpen(false));

  const selectTab = (id: AdminTabId) => {
    onSelect(id);
    setIsDrawerOpen(false);
  };

  const overviewGroup = groups.find((g) => g.id === "overview");
  const otherGroups = groups.filter((g) => g.id !== "overview");

  const renderItem = (id: AdminTabId, label: string, Icon: LucideIcon) => {
    const active = activeTab === id;
    const disabled = disabledTabIds.has(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => selectTab(id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "rally-press flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
          active ? "rally-bg-accent text-white" : "text-foreground/80 hover:bg-accent hover:text-foreground",
        )}
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
  };

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        aria-haspopup="menu"
        aria-expanded={isDrawerOpen}
        className="rally-surface rally-press flex w-full items-center gap-2.5 rounded-lg p-3 text-sm font-semibold text-foreground"
      >
        <Menu className="h-4 w-4 shrink-0 text-muted-foreground" />
        <ActiveIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{activeTabLabel}</span>
      </button>

      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <dialog
        ref={drawerRef}
        open={isDrawerOpen || undefined}
        aria-modal="true"
        aria-label="Secções de administração"
        className={cn(
          "rally-elevate fixed inset-y-0 left-auto right-0 z-50 m-0 flex h-full max-h-none w-72 max-w-[85vw] flex-col border-y-0 border-l border-r-0 border-border bg-popover outline-none transition-transform duration-300 ease-out",
          isDrawerOpen ? "translate-x-0" : "pointer-events-none invisible translate-x-full",
        )}
        style={{
          paddingTop: "max(20px, var(--safe-top))",
          paddingBottom: "calc(var(--safe-bottom) + var(--rally-tabbar-height))",
          paddingRight: "var(--safe-right)",
          paddingLeft: "var(--safe-left)",
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="rally-display truncate text-sm font-black uppercase tracking-tight text-popover-foreground">
            Administração
          </span>
          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Fechar menu"
            className="-m-2 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Secções de administração" className="flex-1 space-y-1 overflow-y-auto p-3">
          {overviewGroup?.items.map(({ id, label, icon: Icon }) => renderItem(id, label, Icon))}

          {otherGroups.map((group) => {
            const containsActive = group.items.some((item) => item.id === activeTab);
            return (
              <details key={group.id} className="group" open={containsActive}>
                <summary className="rally-press flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/80 hover:bg-accent/50">
                  <span>{group.label}</span>
                  <span className="text-xs transition-transform group-open:rotate-90">▸</span>
                </summary>
                <div className="space-y-1 pb-1 pl-1 pt-1">
                  {group.items.map(({ id, label, icon: Icon }) => renderItem(id, label, Icon))}
                </div>
              </details>
            );
          })}
        </nav>
      </dialog>
    </div>
  );
}
