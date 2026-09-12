import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useQRCodeScanner } from "@/hooks/useQRCodeScanner";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { logger } from "@/lib/logger";

// iOS in standalone (installed PWA) mode can leave the play() promise pending
// indefinitely, so we give playback this long to actually start before falling
// back to the manual tap-to-start affordance.
const PLAY_WATCHDOG_MS = 2500;

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
  const playWatchdogRef = useRef<ReturnType<typeof setTimeout>>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  // iOS can reject an autoplay attempt that is no longer tied to the opening
  // tap. The stream is live at that point (the camera indicator is on) but the
  // element stays paused and paints nothing, so we surface a tap-to-start.
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const { isActive, startScanning, stopScanning } = useQRCodeScanner(videoRef, canvasRef, onScan);

  // Single place where "the preview is really running" is decided. Fired by the
  // element's own `playing` event, so it works whether playback was started by
  // the automatic attempt or by the manual tap.
  const handleVideoPlaying = useCallback(() => {
    if (playWatchdogRef.current) {
      clearTimeout(playWatchdogRef.current);
      playWatchdogRef.current = undefined;
    }
    setNeedsTapToPlay(false);
    setIsVideoReady(true);
    startScanning();
  }, [startScanning]);

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

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        // Safari/WebKit only honours inline playback when these are set as
        // attributes on the element; React's `muted` prop alone is not enough
        // to make the stream count as muted autoplay.
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.muted = true;
        video.srcObject = stream;

        // Play right after attaching the stream instead of waiting for
        // `loadedmetadata`: with a MediaStream source iOS often never fires
        // that event until playback has already been requested, which left the
        // camera running with a blank element.
        //
        // The promise is deliberately NOT awaited. In an installed iOS PWA it
        // can stay pending forever even though playback actually starts, which
        // used to leave the scanner stuck on the spinner with the camera
        // indicator lit. Readiness is driven by the element's own `playing`
        // event (see handleVideoPlaying) and a watchdog below.
        video.play().then(
          () => {
            if (!cancelled) handleVideoPlaying();
          },
          (playErr) => {
            if (cancelled) return;
            logger.error("Error playing video", playErr);
            setNeedsTapToPlay(true);
          },
        );

        // If neither the promise nor the `playing` event has moved us forward,
        // offer the manual tap. Cleared as soon as playback really starts.
        playWatchdogRef.current = globalThis.setTimeout(() => {
          if (cancelled) return;
          const el = videoRef.current;
          if (el && !el.paused && el.videoWidth > 0) return;
          setNeedsTapToPlay(true);
        }, PLAY_WATCHDOG_MS);
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
        logger.error("Camera error", err);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (playWatchdogRef.current) {
        clearTimeout(playWatchdogRef.current);
        playWatchdogRef.current = undefined;
      }
      setIsVideoReady(false);
      setNeedsTapToPlay(false);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // iOS pauses the element when the app is backgrounded and does not resume it
  // on return, so the preview would come back frozen/black.
  useEffect(() => {
    if (!isOpen) return;
    const resume = () => {
      const video = videoRef.current;
      if (document.visibilityState !== "visible" || !video?.srcObject || !video.paused) return;
      video.play().catch((err) => logger.error("Error resuming video", err));
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [isOpen]);

  const handleTapToPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().then(handleVideoPlaying, (err) => {
      logger.error("Error playing video", err);
      setCameraError("Erro ao iniciar câmara");
    });
  };

  const handleClose = () => {
    stopCamera();
    onClose?.();
  };

  // Back gesture closes the scanner (and releases the camera) instead of
  // navigating away with the stream still live.
  useBackDismiss(isOpen, handleClose);

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
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              autoPlay
              muted
              onPlaying={handleVideoPlaying}
              onLoadedMetadata={() => {
                // iOS sometimes reports metadata without ever firing `playing`
                // for a MediaStream. Real dimensions mean the preview paints.
                if (videoRef.current?.videoWidth) handleVideoPlaying();
              }}
            />
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

            {/* Tap-to-start fallback for browsers that refused the autoplay */}
            {needsTapToPlay && (
              <button
                type="button"
                onClick={handleTapToPlay}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80"
              >
                <Camera className="h-10 w-10 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Toque para ativar a câmara
                </span>
              </button>
            )}

            {/* Loading indicator — gated on the video itself, never on the scan
                loop, so a live preview is never hidden behind an opaque layer. */}
            {!isVideoReady && !needsTapToPlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Spinner size="md" className="text-primary" label="" />
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
