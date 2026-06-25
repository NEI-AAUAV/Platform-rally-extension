import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";

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
      const returnUrl = sessionStorage.getItem("rally_auth_return_url");
      sessionStorage.removeItem("rally_auth_return_url");
      navigate(returnUrl || "/", { replace: true });
    } else if (auth.error) {
      navigate("/", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="rally-border-accent mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p className="text-[rgb(255,255,255,0.65)]">
          {auth.error ? `Erro de autenticação: ${auth.error.message}` : "A concluir sessão…"}
        </p>
      </div>
    </div>
  );
}
