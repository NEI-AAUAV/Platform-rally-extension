import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2 } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { useNavigate } from "@tanstack/react-router";
import { getMyCheckpoint } from "@/client";

export default function StaffEvaluationPage() {
  const userStore = useUserStore();
  const navigate = useNavigate();

  const { data: myCheckpoint } = useQuery({
    queryKey: ["myCheckpoint"],
    queryFn: async () => {
      const { data } = await getMyCheckpoint();
      return data;
    },
    enabled: !!userStore.token,
    staleTime: 0, // Always refetch: admin may reassign this staff member's checkpoint at any time
  });

  useEffect(() => {
    if (myCheckpoint) {
      navigate({
        to: "/staff-evaluation/checkpoint/$checkpointId",
        params: { checkpointId: String(myCheckpoint.id) },
      });
    }
  }, [myCheckpoint, navigate]);

  if (!myCheckpoint) {
    return (
      <div className="rally-surface rally-elevate mx-auto max-w-lg rounded-2xl p-10 text-center">
        <span className="rally-bg-accent-soft rally-accent mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
          <Activity className="h-6 w-6" />
        </span>
        <h2 className="rally-display text-xl font-bold text-foreground">Sem posto atribuído</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ainda não foste atribuído a um posto. Contacta um administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="rally-surface rally-elevate mx-auto max-w-lg rounded-2xl p-10 text-center">
      <Loader2 className="rally-accent mx-auto mb-4 h-10 w-10 animate-spin" />
      <p className="text-sm text-muted-foreground">
        A redirecionar para a avaliação do teu posto...
      </p>
    </div>
  );
}
