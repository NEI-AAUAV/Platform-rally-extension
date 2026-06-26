import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Loader2, QrCode } from "lucide-react";
import { useCheckinToken } from "@/hooks/useCheckin";

/**
 * Staff-facing rotating check-in QR. Teams scan it to self-check-in. Renders
 * nothing when self check-in is disabled or the staff member has no checkpoint
 * (both surface as a non-retried query error).
 */
export function CheckinQrPanel() {
  const { data, isLoading, isError } = useCheckinToken();

  if (isError) return null;

  return (
    <section className="rally-brutal mb-6 flex flex-col items-center gap-3 bg-muted p-5">
      <h3 className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
        <QrCode className="rally-accent h-5 w-5" strokeWidth={2.25} />
        Check-in da equipa
      </h3>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        As equipas digitalizam este código para registar a chegada. Renova-se
        automaticamente — mantém-no visível no posto.
      </p>
      <div className="rounded-xl bg-white p-4">
        {isLoading || !data ? (
          <div className="flex h-[200px] w-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-black/40" />
          </div>
        ) : (
          <motion.div
            key={data.token}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <QRCodeSVG value={data.token} size={200} level="M" includeMargin />
          </motion.div>
        )}
      </div>
    </section>
  );
}
