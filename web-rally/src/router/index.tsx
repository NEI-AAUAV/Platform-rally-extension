import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes";

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  // No defaultViewTransition here on purpose. The ::view-transition-new(root)
  // rule in global.css is the circular reveal written for the light/dark
  // toggle, and it applies to *any* root view transition — turning it on for
  // navigation made every page change wipe in as a circle from the centre
  // (with no --reveal-x/y set, the origin falls back to 50% 50%). Scoping that
  // animation to the toggle is a prerequisite for enabling it here.
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function Router() {
  return <RouterProvider router={router} />;
}
