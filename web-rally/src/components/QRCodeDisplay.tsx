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
export default function QRCodeDisplay({ accessCode, size = 200, className = "" }: QRCodeDisplayProps) {
    // Generate the team login URL with access code
    const loginUrl = `${window.location.origin}/rally/team-login?code=${accessCode}`;

    return (
        <div className={`flex flex-col items-center gap-4 ${className}`}>
            <div className="p-4 bg-white rounded-xl">
                <QRCodeSVG
                    value={loginUrl}
                    size={size}
                    level="H" // High error correction
                    includeMargin={true}
                />
            </div>
            <div className="text-center">
                <p className="text-sm text-white/70">Código de Acesso</p>
                <p className="text-2xl font-mono font-bold tracking-wider mt-1">{accessCode}</p>
            </div>
        </div>
    );
}
