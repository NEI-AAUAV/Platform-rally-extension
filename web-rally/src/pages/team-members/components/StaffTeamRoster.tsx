import { Users, QrCode } from "lucide-react";
import QRCodeDisplay from "@/components/qr/QRCodeDisplay";
import type { TeamMemberResponse, DetailedTeam } from "@/client";

type ExtendedDetailedTeam = Omit<DetailedTeam, "access_code"> & { access_code?: string };

type StaffTeamRosterProps = Readonly<{
  teamName: string | undefined;
  teamMembers: TeamMemberResponse[] | undefined;
  teamData: DetailedTeam | undefined;
}>;

export default function StaffTeamRoster({ teamName, teamMembers, teamData }: StaffTeamRosterProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rally-surface rounded-2xl p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          Membros da Equipa
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {teamName} • {teamMembers?.length || 0} membros
        </p>
        <div className="space-y-2">
          {teamMembers?.length === 0 ? (
            <p className="text-center opacity-50">Nenhum membro registado</p>
          ) : (
            teamMembers?.map((member) => (
              <div key={member.id} className="rounded-lg border border-border bg-muted p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{member.name}</p>
                    {member.email && (
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    )}
                  </div>
                  {member.is_captain && (
                    <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                      Capitão
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {teamData && (
        <div className="rally-surface flex flex-col items-center justify-center rounded-2xl p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <QrCode className="h-5 w-5" />
            Código QR
          </h3>
          <div className="flex justify-center">
            <QRCodeDisplay
              accessCode={(teamData as ExtendedDetailedTeam).access_code || ""}
              size={200}
            />
          </div>
        </div>
      )}
    </div>
  );
}
