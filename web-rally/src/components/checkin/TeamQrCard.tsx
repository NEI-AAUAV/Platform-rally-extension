import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";

interface TeamQrCardProps {
  readonly accessCode: string;
}

/**
 * Team-facing identity QR. The team shows this to the staff at each checkpoint;
 * the staff scans it to identify the team, open its evaluation and register
 * arrival. Encodes the team's access code (the same code shown as text), so a
 * staff scan resolves straight to this team.
 */
export function TeamQrCard({ accessCode }: TeamQrCardProps) {
  return (
    <div className="rally-surface rounded-[18px] p-[20px_24px]">
      <div className="mb-1 flex items-center gap-2">
        <QrCode className="h-4 w-4 rally-accent" />
        <h3 className="rally-display text-[16px] font-bold text-foreground">
          O teu QR de equipa
        </h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        Mostra este código ao staff à chegada a cada posto. Eles leem-no para
        registar a tua chegada e abrir a avaliação.
      </p>

      <div className="flex items-center gap-5">
        <div className="shrink-0 rounded-[12px] border border-border bg-white p-[12px]">
          <QRCodeSVG value={accessCode} size={120} level="M" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Código
          </p>
          <p className="rally-display mt-1 font-mono text-2xl font-bold tracking-[0.18em] text-foreground">
            {accessCode}
          </p>
        </div>
      </div>
    </div>
  );
}
