import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes";

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  // Cross-fade page swaps through the View Transitions API instead of the hard
  // cut a plain SPA does — the single cheapest thing that stops navigation
  // reading as "a website". The router falls back to an instant swap where the
  // API is missing (Safari before 18). The UA cross-fade is not automatically
  // suppressed under prefers-reduced-motion, so global.css disables it there.
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function Router() {
  return <RouterProvider router={router} />;
}
