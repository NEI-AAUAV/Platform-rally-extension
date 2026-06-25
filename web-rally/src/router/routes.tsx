import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  Navigate,
} from "@tanstack/react-router";
import MainLayout from "@/pages/layout";
import RootRedirect from "./RootRedirect";

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
  component: RootRedirect,
});

const scoreboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/scoreboard",
  component: lazyRouteComponent(() => import("@/pages/scoreboard")),
});

const postosRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/postos",
  component: lazyRouteComponent(() => import("@/pages/postos")),
});

const teamsRedirectRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/teams",
  component: () => <Navigate to="/scoreboard" replace />,
});

const teamByIdRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/teams/$id",
  component: lazyRouteComponent(() => import("@/pages/teams/id")),
});

const adminRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("@/pages/admin")),
});

const assignmentRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/assignment",
  component: lazyRouteComponent(() => import("@/pages/assignment")),
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

const teamMembersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/team-members",
  component: lazyRouteComponent(() => import("@/pages/team-members")),
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
    postosRoute,
    teamsRedirectRoute,
    teamByIdRoute,
    adminRoute,
    assignmentRoute,
    versusRoute,
    teamLoginRoute,
    teamProgressRoute,
    settingsRoute,
    teamMembersRoute,
    staffEvaluationRoute,
    checkpointEvaluationRoute,
  ]),
]);
