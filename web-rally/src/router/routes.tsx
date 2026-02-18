import MainLayout from "@/pages/layout";
import { Navigate, type RouteObject } from "react-router-dom";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        path: "/",
        element: <Navigate to="/scoreboard" />,
      },
      {
        path: "/scoreboard",
        async lazy() {
          const { default: Scoreboard } = await import("@/pages/scoreboard");
          return { Component: Scoreboard };
        },
      },
      {
        path: "/postos",
        async lazy() {
          const { default: Postos } = await import("@/pages/postos");
          return { Component: Postos };
        },
      },
      {
        path: "/teams",
        element: <Navigate to="/scoreboard" replace />,
      },
      {
        path: "/teams/:id",
        async lazy() {
          const { default: TeamsById } = await import("@/pages/teams/id");
          return { Component: TeamsById };
        },
      },
      {
        path: "/admin",
        async lazy() {
          const { default: Admin } = await import("@/pages/admin");
          return { Component: Admin };
        },
      },
      {
        path: "/assignment",
        async lazy() {
          const { default: Assignment } = await import("@/pages/assignment");
          return { Component: Assignment };
        },
      },
      {
        path: "/versus",
        async lazy() {
          const { default: Versus } = await import("@/pages/versus");
          return { Component: Versus };
        },
      },
      {
        path: "/team-login",
        async lazy() {
          const { default: TeamLogin } = await import("@/pages/team-login");
          return { Component: TeamLogin };
        },
      },
      {
        path: "/team-progress",
        async lazy() {
          const { default: TeamProgress } = await import("@/pages/team-progress");
          return { Component: TeamProgress };
        },
      },
      {
        path: "/settings",
        async lazy() {
          const { default: Settings } = await import("@/pages/settings");
          return { Component: Settings };
        },
      },
      {
        path: "/team-members",
        async lazy() {
          const { default: TeamMembers } = await import("@/pages/team-members");
          return { Component: TeamMembers };
        },
      },
      {
        path: "/staff-evaluation",
        async lazy() {
          const { default: StaffEvaluation } = await import("@/pages/staff-evaluation");
          return { Component: StaffEvaluation };
        },
      },
      {
        path: "/staff-evaluation/checkpoint/:checkpointId",
        async lazy() {
          const { default: CheckpointTeamEvaluation } = await import("@/pages/staff-evaluation/components/CheckpointTeamEvaluation");
          return { Component: CheckpointTeamEvaluation };
        },
      },
      {
        path: "/show-team-code",
        async lazy() {
          const { default: ShowTeamCode } = await import("@/pages/show-team-code");
          return { Component: ShowTeamCode };
        },
      },
    ],
  },
];

export default routes;
