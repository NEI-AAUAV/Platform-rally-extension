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
        async lazy() {
          const { default: Teams } = await import("@/pages/teams");
          return { Component: Teams };
        },
      },
      {
        path: "/teams/:id",
        async lazy() {
          const { default: TeamsById } = await import("@/pages/teams/[id]");
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
    ],
  },
];

export default routes;
