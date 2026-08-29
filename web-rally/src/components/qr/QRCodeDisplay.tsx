import { QRCodeSVG } from "qrcode.react";

interface QRCodeDisplayProps {
  accessCode: string;
  size?: number;
  className?: string;
}

/**
 * Component to display a QR code for team login
 * Generates a URL with the access code pre-filled
 */
export default function QRCodeDisplay({
  accessCode,
  size = 200,
  className = "",
}: Readonly<QRCodeDisplayProps>) {
  // Without a code there is nothing scannable — render a hint instead of a QR
  // that resolves to an empty login URL.
  if (!accessCode) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <p className="text-sm text-muted-foreground">Código de acesso indisponível</p>
      </div>
    );
  }

  // Generate the team login URL with access code
  const loginUrl = `${globalThis.location.origin}/rally/team-login?code=${accessCode}`;

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* `size` is the intrinsic/max size; the SVG scales down inside narrow
          phone modals instead of pushing the dialog wider than the viewport. */}
      <div className="w-full max-w-full rounded-xl bg-white p-4" style={{ maxWidth: size + 32 }}>
        <QRCodeSVG
          value={loginUrl}
          size={size}
          level="H" // High error correction
          includeMargin={true}
          className="h-auto w-full"
        />
      </div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Código de Acesso</p>
        <p className="font-mono mt-1 break-all text-2xl font-bold tracking-wider">{accessCode}</p>
      </div>
    </div>
  );
}
