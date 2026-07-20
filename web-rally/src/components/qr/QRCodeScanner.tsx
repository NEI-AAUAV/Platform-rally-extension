import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQRCodeScanner } from "@/hooks/useQRCodeScanner";

type QRCodeScannerProps = Readonly<{
  onScan: (data: string) => void;
  onClose?: () => void;
  isOpen?: boolean;
  className?: string;
}>;

/**
 * Component to scan QR codes using device camera.
 * Uses the jsqr library (via the useQRCodeScanner hook) for QR code detection from canvas.
 */
export default function QRCodeScanner({
  onScan,
  onClose,
  isOpen = true,
  className = "",
}: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { isActive, startScanning, stopScanning } = useQRCodeScanner(videoRef, canvasRef, onScan);

  const stopCamera = useCallback(() => {
    stopScanning();
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  }, [stopScanning]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const startCamera = async () => {
      try {
        setCameraError(null);
        setPermissionDenied(false);

        const constraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((err) => {
              console.error("Error playing video:", err);
              setCameraError("Erro ao iniciar câmara");
            });
            // Start scanning after video is ready
            setTimeout(() => startScanning(), 100);
          };
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setPermissionDenied(true);
          setCameraError(
            "Permissão de câmara negada. Por favor, ative a câmara nas configurações.",
          );
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          setCameraError("Nenhuma câmara disponível no dispositivo.");
        } else {
          setCameraError("Não foi possível aceder à câmara. Tente novamente.");
        }
        console.error("Camera error:", err);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    stopCamera();
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 ${className}`}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-black">
        {/* Close button */}
        <button
            type={"button"}
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
          aria-label="Close QR code scanner"
        >
          <X className="h-5 w-5 text-foreground" />
        </button>

        {/* Video element */}
        {permissionDenied ? (
          <div className="flex aspect-square flex-col items-center justify-center gap-4 bg-muted">
            <Camera className="h-12 w-12 text-red-500/50" />
            <div className="px-4 text-center">
              <p className="mb-2 font-semibold text-foreground">Permissão Negada</p>
              <p className="text-sm text-muted-foreground">
                {cameraError || "Por favor, ative o acesso à câmara para utilizar o scanner."}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative aspect-square bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            {isActive && (
              <>
                <div className="pointer-events-none absolute inset-0 rounded-lg border-4 border-primary/40" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 transform animate-pulse rounded-lg border-4 border-primary" />

                {/* Scanning corner guides */}
                <div className="absolute left-8 top-8 h-8 w-8 border-l-2 border-t-2 border-primary" />
                <div className="absolute right-8 top-8 h-8 w-8 border-r-2 border-t-2 border-primary" />
                <div className="absolute bottom-8 left-8 h-8 w-8 border-b-2 border-l-2 border-primary" />
                <div className="absolute bottom-8 right-8 h-8 w-8 border-b-2 border-r-2 border-primary" />
              </>
            )}

            {/* Loading indicator */}
            {!isActive && !permissionDenied && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="border-t border-border bg-black/70 p-4">
          <p className="text-center text-sm text-muted-foreground">
            Alinhe o código QR com o quadrado para escanear
          </p>
          {cameraError && !permissionDenied && (
            <p className="mt-2 text-center text-xs text-red-400">{cameraError}</p>
          )}
        </div>

        {/* Close button footer */}
        <div className="border-t border-border p-4">
          <Button onClick={handleClose} variant="outline" className="w-full">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
