import React, { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { logger } from "@/lib/logger";

/**
 * Custom hook for QR code scanning
 * Uses canvas-based detection with jsQR library
 */
export function useQRCodeScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  onDetectCode: (code: string) => void,
) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanIntervalRef = useRef<number>();

  const scan = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    // iOS reports 0x0 for the first frames after play() resolves; drawing then
    // throws and used to kill the loop for good. Wait for real dimensions.
    if (!video.videoWidth || !video.videoHeight) {
      scanIntervalRef.current = globalThis.requestAnimationFrame(scan);
      return;
    }

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        // Release the camera immediately on a hit. Otherwise the MediaStream
        // stays live (camera indicator on) until the parent happens to unmount
        // or close the scanner — which never happens on an error/invalid path
        // where the modal stays open.
        setIsActive(false);
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        onDetectCode(code.data);
        return;
      }

      // Continue scanning
      scanIntervalRef.current = globalThis.requestAnimationFrame(scan);
    } catch (err) {
      logger.error("Scanning error", err);
      setError("Erro ao processar câmara");
    }
  }, [videoRef, canvasRef, isActive, onDetectCode]);

  const startScanning = () => {
    setIsActive(true);
    setError(null);
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
  }, [isActive, scan]);

  return {
    isActive,
    error,
    startScanning,
    stopScanning,
    setError,
  };
}
