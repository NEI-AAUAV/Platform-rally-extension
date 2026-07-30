import ErrorBanner from "./ErrorBanner";
import NoTeamsMessage from "./NoTeamsMessage";

/** Shared error/loading/empty-state banners for the team selector, used by
 * both the admin team-members page and the staff-only team view. */
export function TeamMembersErrorBanners({
  teamsError,
  membersError,
}: {
  readonly teamsError?: Error | null;
  readonly membersError?: Error | null;
}) {
  return (
    <>
      {teamsError && <ErrorBanner title="Erro ao carregar equipas:" error={teamsError} />}
      {membersError && <ErrorBanner title="Erro ao carregar membros:" error={membersError} />}
    </>
  );
}

export function TeamsLoadingBanner({ teamsLoading }: { readonly teamsLoading?: boolean }) {
  if (!teamsLoading) return null;
  return (
    <div className="rounded-lg border border-border bg-muted p-4 sm:p-6">
      <p className="text-muted-foreground">A carregar equipas...</p>
    </div>
  );
}

export function MembersLoadingBanner({ membersLoading }: { readonly membersLoading?: boolean }) {
  if (!membersLoading) return null;
  return (
    <div className="rounded-lg border border-border bg-muted p-4 sm:p-6">
      <p className="text-muted-foreground">A carregar membros da equipa...</p>
    </div>
  );
}

export function NoTeamsBanner({
  teamsLoading,
  teamsError,
  hasTeams,
  description,
}: {
  readonly teamsLoading?: boolean;
  readonly teamsError?: Error | null;
  readonly hasTeams: boolean;
  readonly description: string;
}) {
  if (teamsLoading || teamsError || hasTeams) return null;
  return <NoTeamsMessage description={description} />;
}
