import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type AssignmentPagerProps = Readonly<{
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPlaceholder: string;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}>;

/**
 * Search box + prev/next controls shared by the staff and guide assignment
 * lists. Both list the current holders of an Authentik-derived role (see
 * UserService._mirrored_group_users on the backend) — a set that only
 * grows over a deployment's life — so the API paginates and this is how an
 * admin gets to one specific person without scrolling through everyone.
 */
export default function AssignmentPager({
  searchInput,
  onSearchInputChange,
  searchPlaceholder,
  page,
  totalPages,
  total,
  onPageChange,
}: AssignmentPagerProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          aria-label={searchPlaceholder}
        />
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Página {page} de {totalPages} · {total} no total
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Seguinte
          </Button>
        </div>
      )}
    </div>
  );
}
