import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import QRCodeScanner from "@/components/QRCodeScanner";
import { CheckinService } from "@/services/CheckinService";
import { useAppToast } from "@/hooks/use-toast";
import { ApiError } from "@/client";

function errorDetail(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Não foi possível fazer o check-in.";
}

/**
 * Team-facing QR check-in: opens the camera scanner, submits the scanned token
 * and reports the result. The scanner can fire repeatedly, so a ref guards
 * against double submits for a single open session.
 */
export function CheckinScanButton() {
  const [open, setOpen] = useState(false);
  const submittedRef = useRef(false);
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (token: string) => CheckinService.checkIn(token),
    onSuccess: (res) => {
      toast.success(`Check-in no posto ${res.checkpoint_order} concluído!`);
      close();
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => {
      toast.error(errorDetail(err));
      // Allow a retry within the same open session.
      submittedRef.current = false;
    },
  });

  function close() {
    submittedRef.current = false;
    setOpen(false);
  }

  function handleScan(token: string) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    mutate(token);
  }

  return (
    <>
      <div className="rally-surface rounded-[20px] p-[24px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Vista da Equipa
        </p>
        <h3 className="rally-display font-bold text-[17px] text-foreground mb-[6px]">
          Fazer Check-in por QR
        </h3>
        <p className="text-[13px] text-muted-foreground mb-5 leading-relaxed">
          Aponta a câmara ao código QR exibido pelo staff do posto para registar a chegada.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-[10px] py-[18px] rounded-[14px] rally-bg-accent text-white font-bold text-[16px] disabled:opacity-60"
          style={{ boxShadow: "0 16px 36px -16px var(--rally-accent, #008542)" }}
        >
          <Camera className="h-5 w-5" />
          {isPending ? "A registar..." : "Abrir câmara · Scan QR"}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md">
            <QRCodeScanner isOpen={open} onScan={handleScan} onClose={close} />
          </div>
        </div>
      )}
    </>
  );
}
