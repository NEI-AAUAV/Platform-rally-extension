import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, QrCode, Check } from "lucide-react";
import QRCodeScanner from "@/components/qr/QRCodeScanner";
import { CheckinService, type StaffCheckinResponse } from "@/services/CheckinService";
import { useAppToast } from "@/hooks/use-toast";
import { ApiError } from "@/services/apiClient";

interface StaffCheckinScannerProps {
  /** Checkpoint the staff member is scanning teams into. */
  readonly checkpointId: number;
  /** Called after a successful scan so the caller can open that team's evaluation. */
  readonly onTeamIdentified?: (teamId: number) => void;
}

interface RecentScan {
  name: string;
  at: string;
  status: StaffCheckinResponse["status"];
}

function errorDetail(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Não foi possível identificar a equipa.";
}

/** Extract a team access code from a scanned string (raw code or login URL). */
function extractTeamCode(scanned: string): string | null {
  const trimmed = scanned.trim();
  if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(trimmed)) return trimmed.toUpperCase();
  try {
    const code = new URL(trimmed).searchParams.get("code");
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Staff-facing scan: read an arriving team's QR (its access code) to *identify*
 * the team and jump straight to its evaluation — avoiding picking the wrong
 * team — while marking arrival at this post when appropriate. Tolerant of
 * re-scans and early scans (versus/head-to-head friendly): it always identifies
 * the team and reports the arrival status.
 */
export function StaffCheckinScanner({ checkpointId, onTeamIdentified }: StaffCheckinScannerProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const submittedRef = useRef(false);
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (code: string) => CheckinService.staffCheckIn(code, checkpointId),
    onSuccess: (res) => {
      if (res.status === "checked_in") {
        toast.success(`${res.team_name} — chegada registada no posto ${res.checkpoint_order}.`);
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        queryClient.invalidateQueries({ queryKey: ["checkpointTeams"] });
      } else if (res.status === "already_present") {
        toast.success(`${res.team_name} — já neste posto. A abrir avaliação.`);
      } else {
        toast.warning(`${res.team_name} ainda não chegou a este posto (vem mais à frente).`);
      }
      setRecent((prev) =>
        [
          {
            name: res.team_name,
            at: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
            status: res.status,
          },
          ...prev,
        ].slice(0, 5),
      );
      onTeamIdentified?.(res.team_id);
      close();
    },
    onError: (err) => {
      toast.error(errorDetail(err));
      submittedRef.current = false;
    },
  });

  function close() {
    submittedRef.current = false;
    setOpen(false);
  }

  function handleScan(scanned: string) {
    if (submittedRef.current) return;
    const code = extractTeamCode(scanned);
    if (!code) {
      toast.error("QR inválido. Aponta ao código da equipa.");
      return;
    }
    submittedRef.current = true;
    mutate(code);
  }

  return (
    <div className="rally-surface rounded-[18px] p-[20px_24px]">
      <div className="mb-1 flex items-center gap-2">
        <QrCode className="rally-accent h-4 w-4" />
        <h3 className="rally-display text-[16px] font-bold text-foreground">
          Identificar equipa por QR
        </h3>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Lê o QR da equipa que chega para abrir a sua avaliação sem enganos e registar a chegada. A
        equipa mostra o código em <span className="font-semibold text-foreground">Progresso</span>.
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="rally-bg-accent inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[15px] font-bold text-white disabled:opacity-60"
      >
        <Camera className="h-5 w-5" />
        {isPending ? "A identificar..." : "Ler QR da equipa"}
      </button>

      {recent.length > 0 && (
        <ul className="mt-4 space-y-2">
          {recent.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="flex items-center gap-2.5 rounded-[11px] bg-muted/40 px-3 py-2 text-sm"
            >
              <Check className="rally-accent h-4 w-4 shrink-0" />
              <span className="font-semibold text-foreground">{r.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{r.at}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md">
            <QRCodeScanner isOpen={open} onScan={handleScan} onClose={close} />
          </div>
        </div>
      )}
    </div>
  );
}
