import {
  Users,
  MapPin,
  Activity as ActivityIcon,
  Palette,
  CalendarRange,
  Settings2,
  ClipboardList,
  Swords,
  UserCog,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  Gavel,
  Trophy,
  Zap,
  History,
  Gauge,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import type { AdminTabId } from "@/router/routes";

export type AdminSectionId =
  | "overview"
  | "preparation"
  | "operations"
  | "competition"
  | "event"
  | "system";

export interface AdminNavItem {
  id: AdminTabId;
  label: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  id: AdminSectionId;
  label: string;
  items: readonly AdminNavItem[];
}

/**
 * Single source of truth for admin navigation: tab ids, labels, icons and
 * how they group conceptually. Every consumer (sidebar, mobile drawer,
 * AdminSearch) derives from this — do not redeclare tab lists elsewhere.
 */
export const ADMIN_NAVIGATION: readonly AdminNavGroup[] = [
  {
    id: "overview",
    label: "Visão geral",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    id: "preparation",
    label: "Preparação",
    items: [
      { id: "teams", label: "Equipas", icon: Users },
      { id: "members", label: "Membros", icon: UserCog },
      { id: "checkpoints", label: "Postos", icon: MapPin },
      { id: "activities", label: "Atividades", icon: ActivityIcon },
    ],
  },
  {
    id: "operations",
    label: "Operação",
    items: [
      { id: "assignment", label: "Atribuições", icon: ClipboardList },
      { id: "guide-assignment", label: "Guias", icon: Compass },
      { id: "evaluation", label: "Avaliação", icon: ClipboardCheck },
      { id: "judging", label: "Julgamento", icon: Gavel },
      { id: "notifications", label: "Anúncios", icon: BellRing },
    ],
  },
  {
    id: "competition",
    label: "Competição",
    items: [
      { id: "scoring", label: "Pontuação", icon: Zap },
      { id: "versus", label: "Versus", icon: Swords },
      { id: "badges", label: "Crachás", icon: Trophy },
    ],
  },
  {
    id: "event",
    label: "Evento",
    items: [
      { id: "branding", label: "Identidade", icon: Palette },
      { id: "events", label: "Edições", icon: CalendarRange },
      { id: "settings", label: "Configurações", icon: Settings2 },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    items: [
      { id: "audit", label: "Auditoria", icon: History },
      { id: "metrics", label: "Métricas", icon: Gauge },
    ],
  },
] as const;

/** Flat list of every admin nav item, derived from ADMIN_NAVIGATION. */
export const ADMIN_ITEMS: readonly AdminNavItem[] = ADMIN_NAVIGATION.flatMap(
  (group) => group.items,
);

/** Lookup map from tab id to its nav item, derived from ADMIN_NAVIGATION. */
export const ADMIN_ITEM_BY_ID: ReadonlyMap<AdminTabId, AdminNavItem> = new Map(
  ADMIN_ITEMS.map((item) => [item.id, item]),
);

/** Tab id -> label, derived from ADMIN_NAVIGATION (replaces duplicated label maps). */
export const ADMIN_TAB_LABELS: Readonly<Record<AdminTabId, string>> = Object.fromEntries(
  ADMIN_ITEMS.map((item) => [item.id, item.label]),
) as Record<AdminTabId, string>;

/** The group containing a given tab id, or undefined if not found. */
export function groupForTab(tabId: AdminTabId): AdminNavGroup | undefined {
  return ADMIN_NAVIGATION.find((group) => group.items.some((item) => item.id === tabId));
}
