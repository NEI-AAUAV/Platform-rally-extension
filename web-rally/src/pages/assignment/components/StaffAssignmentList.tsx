import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MapPin } from "lucide-react";

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  order: number;
}

interface StaffAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

interface StaffAssignmentListProps {
  assignments: StaffAssignment[];
  checkpoints: Checkpoint[] | undefined;
  onUpdateAssignment: (userId: number, checkpointId: number) => void;
  className?: string;
}

export default function StaffAssignmentList({ assignments, checkpoints, onUpdateAssignment, className = "" }: StaffAssignmentListProps) {
  if (assignments.length === 0) {
    return (
      <div className={`text-center text-[rgb(255,255,255,0.7)] py-8 ${className}`}>
        Nenhuma atribuição de staff encontrada.
      </div>
    );
  }
  
  return (
    <div className={`space-y-4 ${className}`}>
      {assignments.map((assignment: StaffAssignment) => (
        <div
          key={assignment.id}
          className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[rgb(255,255,255,0.1)] rounded-full flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold">
                {assignment.user_name || `User ${assignment.user_id}`}
              </div>
              <div className="text-sm text-[rgb(255,255,255,0.7)]">
                {assignment.user_email && `${assignment.user_email} • `}ID: {assignment.user_id}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">
                Checkpoint: {assignment.checkpoint_name || "Não atribuído"}
              </span>
            </div>

            <Select
              value={assignment.checkpoint_id ? String(assignment.checkpoint_id) : "none"}
              onValueChange={(value: string) => {
                if (value === "none") {
                  onUpdateAssignment(assignment.user_id, 0); // Use 0 to indicate no assignment
                } else {
                  onUpdateAssignment(assignment.user_id, parseInt(value));
                }
              }}
            >
              <SelectTrigger className="w-48 rounded-xl border border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.04)]">
                <SelectValue placeholder="Reatribuir checkpoint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Remover atribuição</SelectItem>
                {checkpoints?.map((checkpoint: Checkpoint) => (
                  <SelectItem key={checkpoint.id} value={String(checkpoint.id)}>
                    {checkpoint.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}


