import type { ReactNode } from "react";
import { useAuthSync } from "./useAuthSync";

/**
 * Bridges the OIDC session into the user store / API client, then renders its
 * children. Must live inside both AuthProvider and QueryClientProvider so
 * useAuthSync can use react-oidc-context and react-query.
 */
export default function AuthSyncGate({ children }: Readonly<{ children: ReactNode }>) {
  useAuthSync();
  return <>{children}</>;
}
