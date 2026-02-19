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
export default function QRCodeScanner({ onScan, onClose, isOpen = true, className = "" }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { isActive, startScanning, stopScanning } = useQRCodeScanner(
    videoRef,
    canvasRef,
    onScan
  );

  const stopCamera = useCallback(() => {
    stopScanning();
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  }, [stopScanning]);

  useEffect(() => {
    if (!isOpen) return;

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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((err) => {
              console.error("Error playing video:", err);
              setCameraError("Erro ao iniciar câmara");
            });
            startScanning();
          };
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setPermissionDenied(true);
          setCameraError("Permissão de câmara negada. Por favor, ative a câmara nas configurações.");
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
      stopCamera();
    };
  }, [isOpen, startScanning, stopCamera]);

  const handleClose = () => {
    stopCamera();
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 ${className}`}>
      <div className="relative w-full max-w-md bg-black rounded-lg overflow-hidden border border-white/20">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 p-2 rounded-full transition-colors"
          aria-label="Close QR code scanner"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Video element */}
        {permissionDenied ? (
          <div className="aspect-square flex flex-col items-center justify-center bg-black/40 gap-4">
            <Camera className="w-12 h-12 text-red-500/50" />
            <div className="text-center px-4">
              <p className="text-white font-semibold mb-2">Permissão Negada</p>
              <p className="text-white/70 text-sm">
                {cameraError || "Por favor, ative o acesso à câmara para utilizar o scanner."}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative bg-black aspect-square">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            {isActive && (
              <>
                <div className="absolute inset-0 border-4 border-primary/40 pointer-events-none rounded-lg" />
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-4 border-primary rounded-lg pointer-events-none animate-pulse" />

                {/* Scanning corner guides */}
                <div className="absolute top-8 left-8 w-8 h-8 border-t-2 border-l-2 border-primary" />
                <div className="absolute top-8 right-8 w-8 h-8 border-t-2 border-r-2 border-primary" />
                <div className="absolute bottom-8 left-8 w-8 h-8 border-b-2 border-l-2 border-primary" />
                <div className="absolute bottom-8 right-8 w-8 h-8 border-b-2 border-r-2 border-primary" />
              </>
            )}

            {/* Loading indicator */}
            {!isActive && !permissionDenied && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-black/70 p-4 border-t border-white/10">
          <p className="text-white/80 text-sm text-center">
            Alinhe o código QR com o quadrado para escanear
          </p>
          {cameraError && !permissionDenied && (
            <p className="text-red-400 text-xs text-center mt-2">{cameraError}</p>
          )}
        </div>

        {/* Close button footer */}
        <div className="p-4 border-t border-white/10">
          <Button
            onClick={handleClose}
            variant="outline"
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
