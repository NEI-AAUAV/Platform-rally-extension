import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BloodyButton } from "@/components/themes/bloody";
import { ActivityIcon, CheckCircle, Clock, Star, Trophy, ArrowRight } from "lucide-react";

interface TeamActivitiesProps {
  team: any;
  checkpoint: any;
  activities: any[];
  evaluations: any[];
  onActivityClick: (team: any, activity: any) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: ActivityIcon,
};

export default function TeamActivities({ 
  team, 
  checkpoint, 
  activities, 
  evaluations, 
  onActivityClick, 
  onBack, 
  isSubmitting 
}: TeamActivitiesProps) {
  const checkpointActivities = activities?.filter(
    (activity: any) => activity.checkpoint_id === checkpoint?.id
  ) || [];

  return (
    <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-[rgb(255,255,255,0.6)] hover:text-white transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <CardTitle className="text-white flex items-center gap-2">
            <ActivityIcon className="w-5 h-5" />
            {team.name} - Activities
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {checkpointActivities.map((activity: any) => {
            const existingResult = evaluations?.find(
              (evaluation: any) => evaluation.team_id === team.id && evaluation.activity_id === activity.id
            );
            const IconComponent = activityTypeIcons[activity.activity_type as keyof typeof activityTypeIcons] || ActivityIcon;
            
            return (
              <div
                key={activity.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)]"
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="w-5 h-5 text-white" />
                  <div>
                    <h4 className="font-semibold text-white">{activity.name}</h4>
                    <p className="text-sm text-[rgb(255,255,255,0.6)]">
                      {activity.description || "No description"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={existingResult ? "default" : "secondary"}
                    className={
                      existingResult 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-yellow-500/20 text-yellow-400"
                    }
                  >
                    {existingResult ? `Score: ${existingResult.final_score}` : "Pending"}
                  </Badge>
                  <BloodyButton
                    variant="neutral"
                    onClick={() => onActivityClick(team, activity)}
                    disabled={isSubmitting}
                  >
                    {existingResult ? "Update" : "Evaluate"}
                  </BloodyButton>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
