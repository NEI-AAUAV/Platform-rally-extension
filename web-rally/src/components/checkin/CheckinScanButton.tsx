import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button onClick={() => setOpen(true)} disabled={isPending}>
        <Camera className="mr-2 h-4 w-4" />
        Check-in por QR
      </Button>
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
