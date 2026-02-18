declare module 'jsqr' {
  interface Point {
    x: number;
    y: number;
  }

  interface QRCode {
    binaryData: number[];
    data: string;
    chunks: any[];
    location: {
      topRightCorner: Point;
      topLeftCorner: Point;
      bottomRightCorner: Point;
      bottomLeftCorner: Point;
      topRightFinderPattern: Point;
      topLeftFinderPattern: Point;
      bottomLeftFinderPattern: Point;
    };
  }

  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: {
      inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
    }
  ): QRCode | null;

  export default jsQR;
}
