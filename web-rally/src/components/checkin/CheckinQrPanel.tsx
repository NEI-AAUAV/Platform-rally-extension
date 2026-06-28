import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Loader2, QrCode, Users } from "lucide-react";
import { useCheckinToken } from "@/hooks/useCheckin";

/**
 * Staff-facing rotating check-in QR. Teams scan it to self-check-in.
 */
export function CheckinQrPanel() {
  const { data, isLoading, isError } = useCheckinToken();

  if (isError) return null;

  return (
    <div className="rally-surface p-[20px_24px] rounded-[18px] flex flex-wrap items-center gap-5">
      {/* QR display */}
      <div className="shrink-0 rounded-[12px] p-[10px] bg-background border border-border">
        {isLoading || !data ? (
          <div className="flex h-[80px] w-[80px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <motion.div
            key={data.token}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <QRCodeSVG value={data.token} size={80} level="M" />
          </motion.div>
        )}
      </div>

      <div className="flex-1 min-w-[180px]">
        <div className="font-bold text-[16px] text-foreground">Auto Check-in por QR</div>
        <p className="text-sm text-muted-foreground mt-1.5 mb-3.5 leading-relaxed">
          Mostra este código à equipa para que possam fazer o self check-in sem intervenção do staff.
        </p>
        <div className="flex gap-2.5 flex-wrap">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] rally-bg-accent text-white font-bold text-sm"
          >
            <QrCode className="h-4 w-4" />
            Mostrar QR
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-background text-foreground font-bold text-sm border border-border"
          >
            <Users className="h-4 w-4" />
            Check-in Manual
          </button>
        </div>
      </div>
    </div>
  );
}
