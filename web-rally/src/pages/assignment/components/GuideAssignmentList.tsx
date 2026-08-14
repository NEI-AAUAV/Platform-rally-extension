import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Flag } from "lucide-react";

import type { ListingTeam } from "@/client";

interface GuideAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  team_id?: number;
  team_name?: string;
}

type GuideAssignmentListProps = Readonly<{
  assignments: GuideAssignment[];
  teams: ListingTeam[] | undefined;
  onUpdateAssignment: (userId: number, teamId: number) => void;
  className?: string;
  emptyStateMessage?: string;
  selectPlaceholder?: string;
}>;

export default function GuideAssignmentList({
  assignments,
  teams,
  onUpdateAssignment,
  className = "",
  emptyStateMessage = "Nenhuma atribuição de guia encontrada.",
  selectPlaceholder = "Reatribuir equipa",
}: GuideAssignmentListProps) {
  if (assignments.length === 0) {
    return (
      <div className={`py-8 text-center text-muted-foreground ${className}`}>
        {emptyStateMessage}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {assignments.map((assignment: GuideAssignment) => (
        <div
          key={assignment.id}
          className="flex scroll-mt-20 flex-col gap-4 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">
                {assignment.user_name || `User ${assignment.user_id}`}
              </div>
              <div className="text-sm text-muted-foreground">
                {assignment.user_email && `${assignment.user_email} • `}ID: {assignment.user_id}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4" />
              <span className="text-sm">Equipa: {assignment.team_name || "Não atribuída"}</span>
            </div>

            <Select
              value={assignment.team_id ? String(assignment.team_id) : "none"}
              onValueChange={(value: string) => {
                if (value === "none") {
                  onUpdateAssignment(assignment.user_id, 0); // Use 0 to indicate no assignment
                } else {
                  onUpdateAssignment(assignment.user_id, Number.parseInt(value));
                }
              }}
            >
              <SelectTrigger className="w-48 rounded-xl border border-border bg-muted">
                <SelectValue placeholder={selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Remover atribuição</SelectItem>
                {teams?.map((team: ListingTeam) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
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
