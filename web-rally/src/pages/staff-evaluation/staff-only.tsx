import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { useNavigate } from "@tanstack/react-router";
import { StaffEvaluationService } from "@/client";

export default function StaffEvaluationPage() {
  const userStore = useUserStore();
  const navigate = useNavigate();

  // Get staff's assigned checkpoint
  const { data: myCheckpoint } = useQuery({
    queryKey: ["myCheckpoint"],
    queryFn: async () => {
      return await StaffEvaluationService.getMyCheckpointApiRallyV1StaffMyCheckpointGet();
    },
    enabled: !!userStore.token,
  });

  // Redirect to checkpoint evaluation page once checkpoint is loaded
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
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="mb-2 text-xl font-semibold">Sem posto atribuído</h2>
              <p className="text-muted-foreground">
                Ainda não foste atribuído a um posto. Contacta um administrador.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <Activity className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>A redirecionar para a avaliação do teu posto...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}