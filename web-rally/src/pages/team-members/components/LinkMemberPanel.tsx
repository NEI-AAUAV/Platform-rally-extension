import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Search } from "lucide-react";
import {
  TeamMemberLinkService,
  type OidcUserSearchResult,
} from "@/services/TeamMemberLinkService";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { detail?: string } }).body;
    if (body?.detail) return body.detail;
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível ligar a conta.";
}

type LinkMemberPanelProps = Readonly<{
  teamId: number;
  placeholderUserId: number;
  onLinked: () => void;
}>;

/**
 * Inline search-and-link panel: an admin searches NEI accounts and links the
 * chosen one to a name-only placeholder member.
 */
export default function LinkMemberPanel({ teamId, placeholderUserId, onLinked }: LinkMemberPanelProps) {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ["oidcUserSearch", submitted],
    queryFn: () => TeamMemberLinkService.searchOidcUsers(submitted as string),
    enabled: submitted !== null && submitted.trim().length >= 2,
    retry: false,
  });

  const link = useMutation({
    mutationFn: (account: OidcUserSearchResult) =>
      TeamMemberLinkService.linkMember(teamId, placeholderUserId, account),
    onSuccess: () => onLinked(),
  });

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          link.reset();
          setSubmitted(term);
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Procurar conta NEI (nome ou email)"
          aria-label="Procurar conta NEI"
        />
        <Button type="submit" size="sm" disabled={term.trim().length < 2}>
          <Search className="w-4 h-4" />
        </Button>
      </form>

      {search.isError && (
        <p className="mt-2 text-sm text-destructive">{errorMessage(search.error)}</p>
      )}

      {search.isSuccess && (
        <div className="mt-2 space-y-1">
          {search.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
          ) : (
            search.data.map((user: OidcUserSearchResult) => (
              <button
                key={user.authentik_sub}
                type="button"
                disabled={link.isPending}
                onClick={() => link.mutate(user)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-accent disabled:opacity-50"
              >
                <span>
                  <span className="font-medium">{user.name}</span>
                  {user.email && (
                    <span className="text-muted-foreground"> · {user.email}</span>
                  )}
                </span>
                <Link2 className="w-4 h-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}

      {link.isError && (
        <p className="mt-2 text-sm text-destructive">{errorMessage(link.error)}</p>
      )}
    </div>
  );
}
