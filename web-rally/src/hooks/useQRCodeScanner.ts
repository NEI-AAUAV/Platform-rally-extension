import { useEffect, useRef, useState } from "react";

/**
 * Custom hook for QR code scanning
 * Uses canvas-based detection with jsQR library
 */
export function useQRCodeScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  onDetectCode: (code: string) => void
) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanIntervalRef = useRef<number>();

  // Inject jsQR library if not already loaded
  useEffect(() => {
    if (!(window as any).jsQR) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      script.async = true;
      script.onload = () => {
        console.log("jsQR library loaded");
      };
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      };
    }
  }, []);

  const scan = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const jsqr = (window as any).jsQR;
      if (jsqr) {
        const code = jsqr(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          onDetectCode(code.data);
          setIsActive(false); // Stop scanning after detection
          return;
        }
      }

      // Continue scanning
      scanIntervalRef.current = window.requestAnimationFrame(scan);
    } catch (err) {
      console.error("Scanning error:", err);
      setError("Erro ao processar câmara");
    }
  };

  const startScanning = () => {
    setIsActive(true);
    setError(null);
    scan();
  };

  const stopScanning = () => {
    setIsActive(false);
    if (scanIntervalRef.current) {
      cancelAnimationFrame(scanIntervalRef.current);
    }
  };

  useEffect(() => {
    if (isActive) {
      scan();
    }
    return () => {
      if (scanIntervalRef.current) {
        cancelAnimationFrame(scanIntervalRef.current);
      }
    };
  }, [isActive, videoRef, canvasRef]);

  return {
    isActive,
    error,
    startScanning,
    stopScanning,
    setError,
  };
}
