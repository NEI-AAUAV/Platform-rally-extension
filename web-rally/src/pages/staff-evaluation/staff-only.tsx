import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { useNavigate } from "react-router-dom";
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
      navigate(`/staff-evaluation/checkpoint/${myCheckpoint.id}`);
    }
  }, [myCheckpoint, navigate]);

  if (!myCheckpoint) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">No Checkpoint Assigned</h2>
                <p className="text-muted-foreground">
                  You haven't been assigned to a checkpoint yet. Please contact an administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Redirecting to your checkpoint evaluation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}