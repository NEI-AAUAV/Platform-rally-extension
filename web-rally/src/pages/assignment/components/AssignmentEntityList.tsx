import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EntityAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  entity_id?: number;
  entity_name?: string;
}

interface AssignableEntity {
  id: number;
  name: string;
}

type AssignmentEntityListProps = Readonly<{
  assignments: EntityAssignment[];
  options: AssignableEntity[] | undefined;
  onUpdateAssignment: (userId: number, entityId: number) => void;
  className?: string;
  emptyStateMessage: string;
  selectPlaceholder: string;
  entityIcon: LucideIcon;
  entityLabel: string;
  unassignedLabel: string;
}>;

/** Shared row layout behind StaffAssignmentList (checkpoints) and
 * GuideAssignmentList (teams): a user card plus a reassignment select,
 * parameterized over what kind of entity is being assigned. */
export default function AssignmentEntityList({
  assignments,
  options,
  onUpdateAssignment,
  className = "",
  emptyStateMessage,
  selectPlaceholder,
  entityIcon: EntityIcon,
  entityLabel,
  unassignedLabel,
}: AssignmentEntityListProps) {
  if (assignments.length === 0) {
    return (
      <div className={`py-8 text-center text-muted-foreground ${className}`}>
        {emptyStateMessage}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {assignments.map((assignment: EntityAssignment) => (
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
              <EntityIcon className="h-4 w-4" />
              <span className="text-sm">
                {entityLabel}: {assignment.entity_name || unassignedLabel}
              </span>
            </div>

            <Select
              value={assignment.entity_id ? String(assignment.entity_id) : "none"}
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
                {options?.map((option: AssignableEntity) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
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
