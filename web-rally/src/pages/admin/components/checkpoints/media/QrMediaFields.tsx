import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";

type Props = Readonly<{
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}>;

/** Live QR preview as the admin types, so they see exactly what the team
 * will scan before saving — reuses the white-card convention from
 * `QRCodeDisplay.tsx` so the code stays scannable in dark themes. */
export default function QrMediaFields({ draft, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Input
        value={draft.contentText}
        onChange={(e) => onChange({ contentText: e.target.value })}
        placeholder="URL ou texto a codificar no QR"
        className="border-border bg-muted sm:max-w-sm"
      />
      {draft.contentText.trim() && (
        <div className="w-fit shrink-0 rounded-lg bg-white p-2">
          <QRCodeSVG value={draft.contentText} size={64} level="M" />
        </div>
      )}
    </div>
  );
}
