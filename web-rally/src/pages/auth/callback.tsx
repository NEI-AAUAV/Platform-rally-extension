import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "@tanstack/react-router";
import { clearResumeValue, getResumeValue } from "@/lib/authResumeStore";
import { toRouterPath } from "@/lib/url";
import AppShellSkeleton from "@/components/shared/state/AppShellSkeleton";

/**
 * OIDC redirect landing. react-oidc-context completes the code exchange; once
 * resolved we send the user back to where they started (or home).
 */
export default function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isLoading) return;

    if (auth.isAuthenticated) {
      const returnUrl = getResumeValue("rally_auth_return_url");
      clearResumeValue("rally_auth_return_url");
      // returnUrl is an arbitrary stored path (pathname+search+hash), so it is
      // not a statically known route — navigate by raw href.
      // Defensive: `navigate` prepends the router basepath, so a value that
      // still carries it (older builds stored the raw browser pathname, and
      // those entries can outlive a deploy in localStorage) would double it.
      void navigate({ to: returnUrl ? toRouterPath(returnUrl) : "/", replace: true });
    } else if (auth.error) {
      void navigate({ to: "/", replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, navigate]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      {auth.error ? (
        <p className="text-muted-foreground">Erro de autenticação: {auth.error.message}</p>
      ) : (
        <AppShellSkeleton message="A concluir sessão…" />
      )}
    </div>
  );
}
