import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRight } from "lucide-react";

interface Checkpoint {
  id: number;
  name: string;
  description?: string;
  order: number;
}

interface AssignedCheckpointsProps {
  checkpoints: Checkpoint[];
  activities: any[];
  teams: any[];
  onCheckpointClick: (checkpoint: Checkpoint) => void;
}

export default function AssignedCheckpoints({ 
  checkpoints, 
  activities, 
  teams, 
  onCheckpointClick 
}: AssignedCheckpointsProps) {
  if (!checkpoints || checkpoints.length === 0) {
    return (
      <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Assigned Checkpoints
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[rgb(255,255,255,0.7)] text-center py-4">
            No checkpoints found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Assigned Checkpoints
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {checkpoints.map((checkpoint) => {
            const checkpointActivities = activities?.filter(
              (activity: any) => activity.checkpoint_id === checkpoint.id
            ) || [];
            // Show all teams for each checkpoint (no filtering by team location)
            const teamsAtCheckpoint = teams || [];
            
            return (
              <div
                key={checkpoint.id}
                className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)] cursor-pointer hover:bg-[rgb(255,255,255,0.1)] transition-colors active:bg-[rgb(255,255,255,0.15)]"
                onClick={() => onCheckpointClick(checkpoint)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg sm:text-base truncate">{checkpoint.name}</h3>
                    <p className="text-sm text-[rgb(255,255,255,0.6)] mt-1">
                      {checkpointActivities.length} activities • {teamsAtCheckpoint.length} teams
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <Badge variant="outline" className="text-white border-white/20 text-xs sm:text-sm">
                      Checkpoint {checkpoint.order}
                    </Badge>
                    <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4 text-[rgb(255,255,255,0.6)] flex-shrink-0" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export { AssignedCheckpoints };
