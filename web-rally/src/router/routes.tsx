import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  Navigate,
  redirect,
} from "@tanstack/react-router";
import MainLayout from "@/pages/layout";
import { getTeamToken, getTeamData } from "@/lib/auth/tokenStore";

const rootRoute = createRootRoute();

// OIDC redirect target — outside MainLayout so it never hits the auth gate.
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: lazyRouteComponent(() => import("@/pages/auth/callback")),
});

// Pathless layout route: everything below renders inside MainLayout's <Outlet>.
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "main",
  component: MainLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  // Both reads are synchronous localStorage lookups, so a signed-in team
  // never paints the marketing landing (or a blank frame with no active nav
  // tab) even for an instant — redirect before the route renders at all.
  // The <Navigate> in pages/home/index.tsx stays as a fallback for whenever
  // this beforeLoad is bypassed (e.g. tests mounting Home directly).
  beforeLoad: () => {
    if (getTeamToken() && getTeamData()) {
      throw redirect({ to: "/team-progress" });
    }
  },
  component: lazyRouteComponent(() => import("@/pages/home")),
});

const scoreboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/scoreboard",
  component: lazyRouteComponent(() => import("@/pages/scoreboard")),
});

const checkpointsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/checkpoints",
  component: lazyRouteComponent(() => import("@/pages/checkpoints")),
});

const rulesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/rules",
  component: lazyRouteComponent(() => import("@/pages/rules")),
});

const profileRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/profile",
  component: lazyRouteComponent(() => import("@/pages/profile")),
});

const preferencesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/preferences",
  component: lazyRouteComponent(() => import("@/pages/preferences")),
});

export const teamsRedirectRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/teams",
  component: () => <Navigate to="/scoreboard" replace />,
});

const teamByIdRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/teams/$id",
  component: lazyRouteComponent(() => import("@/pages/teams/id")),
});

const ADMIN_TAB_IDS = [
  "dashboard",
  "teams",
  "checkpoints",
  "activities",
  "members",
  "assignment",
  "guide-assignment",
  "evaluation",
  "versus",
  "judging",
  "badges",
  "scoring",
  "branding",
  "events",
  "notifications",
  "settings",
  "audit",
  "metrics",
] as const;

export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export const adminRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("@/pages/admin")),
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTabId } => {
    const tab = search.tab;
    return ADMIN_TAB_IDS.includes(tab as AdminTabId) ? { tab: tab as AdminTabId } : {};
  },
});

const assignmentRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/assignment",
  component: lazyRouteComponent(() => import("@/pages/assignment")),
});

const guideAssignmentRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/guide-assignment",
  component: lazyRouteComponent(() => import("@/pages/guide-assignment")),
});

const versusRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/versus",
  component: lazyRouteComponent(() => import("@/pages/versus")),
});

const teamLoginRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-login",
  component: lazyRouteComponent(() => import("@/pages/team-login")),
});

const teamProgressRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-progress",
  component: lazyRouteComponent(() => import("@/pages/team-progress")),
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/pages/settings")),
});

const achievementsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/achievements",
  component: lazyRouteComponent(() => import("@/pages/achievements")),
});

const teamMembersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-members",
  component: lazyRouteComponent(() => import("@/pages/team-members")),
});

const teamSettingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-settings",
  component: lazyRouteComponent(() => import("@/pages/team-settings")),
});

const teamInfoRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-info",
  component: lazyRouteComponent(() => import("@/pages/team-info")),
});

const guideRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/guide",
  component: lazyRouteComponent(() => import("@/pages/guide")),
});

const staffEvaluationRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/staff-evaluation",
  component: lazyRouteComponent(() => import("@/pages/staff-evaluation")),
});

const checkpointEvaluationRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/staff-evaluation/checkpoint/$checkpointId",
  component: lazyRouteComponent(
    () => import("@/pages/staff-evaluation/components/CheckpointTeamEvaluation"),
  ),
});

export const routeTree = rootRoute.addChildren([
  authCallbackRoute,
  layoutRoute.addChildren([
    indexRoute,
    scoreboardRoute,
    checkpointsRoute,
    rulesRoute,
    profileRoute,
    preferencesRoute,
    teamsRedirectRoute,
    teamByIdRoute,
    adminRoute,
    assignmentRoute,
    guideAssignmentRoute,
    versusRoute,
    teamLoginRoute,
    teamProgressRoute,
    achievementsRoute,
    settingsRoute,
    teamSettingsRoute,
    teamInfoRoute,
    teamMembersRoute,
    staffEvaluationRoute,
    checkpointEvaluationRoute,
    guideRoute,
  ]),
]);
