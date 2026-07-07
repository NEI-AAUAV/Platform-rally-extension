import { Trophy, Crown, CalendarDays, ShieldCheck, LogIn } from "lucide-react";
import { PageHeader, LoadingState } from "@/components/shared";
import { useUserStore } from "@/stores/useUserStore";
import useStaffLogin from "@/hooks/useLoginLink";
import { useProfile } from "@/hooks/useProfile";
import { EVENT_TYPE_LABELS, type EventType } from "@/types/event";
import type { ParticipationEntry } from "@/types/profile";
import JoinTeamCard from "./JoinTeamCard";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ordinal(n: number): string {
  return `${n}º`;
}

function eventTypeLabel(t: string): string {
  return EVENT_TYPE_LABELS[t as EventType] ?? "Evento";
}

function ParticipationCard({ entry }: Readonly<{ entry: ParticipationEntry }>) {
  const date = new Date(entry.joined_at).toLocaleDateString("pt-PT", {
    year: "numeric",
    month: "short",
  });
  return (
    <div className="rally-surface rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="rally-display truncate text-lg font-bold text-foreground">
              {entry.event_name}
            </h3>
            {entry.is_captain && (
              <span className="rally-bg-accent-soft rally-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                <Crown className="h-3 w-3" /> Capitão
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {eventTypeLabel(entry.event_type)}
            {entry.team_name ? ` · ${entry.team_name}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {date}
        </span>
      </div>

      {(entry.team_classification != null || entry.team_total != null) && (
        <div className="mt-4 flex gap-3">
          {entry.team_classification != null && (
            <div className="rally-surface flex-1 rounded-xl px-4 py-3 text-center">
              <div className="rally-accent text-2xl font-bold">
                {ordinal(entry.team_classification)}
              </div>
              <div className="text-xs text-muted-foreground">Classificação</div>
            </div>
          )}
          {entry.team_total != null && (
            <div className="rally-surface flex-1 rounded-xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-foreground">{entry.team_total}</div>
              <div className="text-xs text-muted-foreground">Pontos</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Per-person profile: identity anchored on the NEI (OIDC) login plus the
 * cross-edition participation history. Rally soft-depth styling.
 */
export default function Profile() {
  const { isAuthenticated, name, email, image, scopes, sessionLoading } = useUserStore((s) => s);
  const onStaffLogin = useStaffLogin();
  const { data: profile, isLoading, isError } = useProfile();

  if (sessionLoading) {
    return <LoadingState message="A carregar perfil..." />;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rally-surface rounded-2xl p-6 text-center">
          <ShieldCheck className="rally-accent mx-auto h-10 w-10" />
          <h2 className="rally-display mt-3 text-xl font-bold">Inicia sessão</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O perfil mostra os rallys em que participaste. Entra com a tua conta NEI.
          </p>
          <button
            type="button"
            onClick={() => onStaffLogin()}
            className="rally-bg-accent rally-press mx-auto mt-5 flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Login NEI
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile?.name || name || email || "Utilizador";
  const userEmail = profile?.email || email;
  const userScopes = profile?.scopes ?? scopes ?? [];
  const participations = profile?.participations ?? [];

  let historyContent;
  if (isLoading) {
    historyContent = <LoadingState message="A carregar histórico..." />;
  } else if (isError) {
    historyContent = (
      <div className="rally-surface rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
      </div>
    );
  } else if (participations.length === 0) {
    historyContent = (
      <div className="rally-surface rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Ainda não há participações registadas. Junta-te a uma equipa para começar.
        </p>
      </div>
    );
  } else {
    historyContent = participations.map((entry) => (
      <ParticipationCard key={`${entry.event_id}-${entry.team_id ?? "x"}`} entry={entry} />
    ));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="O meu perfil"
        description="Os teus rallys e classificações ao longo das edições."
      />

      {/* Identity */}
      <div className="rally-surface rounded-2xl p-6">
        <div className="flex items-center gap-4">
          {image ? (
            <img src={image} alt={displayName} className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <span className="rally-bg-accent grid h-16 w-16 place-items-center rounded-2xl text-xl font-bold text-white">
              {initialsOf(displayName)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="rally-display truncate text-2xl font-bold text-foreground">
              {displayName}
            </h2>
            {userEmail && <p className="truncate text-sm text-muted-foreground">{userEmail}</p>}
            {userScopes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userScopes.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Join a team when not yet linked to one */}
      {profile && profile.current_team_id == null && <JoinTeamCard />}

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="rally-accent h-5 w-5" />
          <h2 className="text-lg font-semibold text-foreground">Participações</h2>
        </div>

        {historyContent}
      </div>
    </div>
  );
}
