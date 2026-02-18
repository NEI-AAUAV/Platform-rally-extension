/**
 * Test suite for useQRCodeScanner hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock jsqr
vi.mock('jsqr', () => ({
  default: vi.fn(),
}))

import jsQR from 'jsqr'
import { useQRCodeScanner } from '@/hooks/useQRCodeScanner'

// Helpers to mock browser APIs
const mockTrack = { stop: vi.fn() }
const mockStream = {
  getTracks: vi.fn(() => [mockTrack]),
}

const mockVideoElement = {
  srcObject: null as MediaStream | null,
  play: vi.fn().mockResolvedValue(undefined),
  readyState: 4,
  videoWidth: 640,
  videoHeight: 480,
} as unknown as HTMLVideoElement

const mockCanvasContext = {
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(640 * 480 * 4),
    width: 640,
    height: 480,
  })),
} as unknown as CanvasRenderingContext2D

const mockCanvas = {
  getContext: vi.fn(() => mockCanvasContext),
  width: 0,
  height: 0,
} as unknown as HTMLCanvasElement

describe('useQRCodeScanner', () => {
  let rafCallback: FrameRequestCallback | null = null

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    })

    // Mock document.createElement to return our mock elements
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideoElement
      if (tag === 'canvas') return mockCanvas
      return document.createElement(tag)
    })

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { })
  })

  afterEach(() => {
    rafCallback = null
  })

  describe('initial state', () => {
    it('should start in idle state', () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      expect(result.current.isActive).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  describe('startScanning', () => {
    it('should set isActive to true when camera is available', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isActive).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should request camera access with correct constraints', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'environment' },
      })
    })

    it('should set error when camera permission is denied', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const permissionError = new DOMException('Permission denied', 'NotAllowedError')
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permissionError)

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isActive).toBe(false)
      expect(result.current.error).toContain('permission')
    })

    it('should set error when no camera is found', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const notFoundError = new DOMException('No camera', 'NotFoundError')
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(notFoundError)

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isActive).toBe(false)
      expect(result.current.error).toContain('camera')
    })
  })

  describe('stopScanning', () => {
    it('should stop all camera tracks and set isActive to false', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      act(() => {
        result.current.stopScanning()
      })

      expect(result.current.isActive).toBe(false)
      expect(mockTrack.stop).toHaveBeenCalled()
    })

    it('should cancel the animation frame loop', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      act(() => {
        result.current.stopScanning()
      })

      expect(window.cancelAnimationFrame).toHaveBeenCalled()
    })
  })

  describe('QR code detection', () => {
    it('should call onDetectCode callback when QR code is detected', async () => {
      const onDetectCode = vi.fn()
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }

      // Full mock that satisfies QRCode type
      const mockQRCode = {
        data: 'https://example.com/qr',
        binaryData: new Uint8ClampedArray(0) as unknown as number[],
        chunks: [],
        version: 1,
        location: {
          topRightCorner: { x: 0, y: 0 },
          topLeftCorner: { x: 0, y: 0 },
          bottomRightCorner: { x: 0, y: 0 },
          bottomLeftCorner: { x: 0, y: 0 },
          topRightFinderPattern: { x: 0, y: 0 },
          topLeftFinderPattern: { x: 0, y: 0 },
          bottomLeftFinderPattern: { x: 0, y: 0 },
        },
      }
      vi.mocked(jsQR).mockReturnValue(mockQRCode as any)

      const { result } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      // Trigger the animation frame to process a frame
      act(() => {
        if (rafCallback) rafCallback(0)
      })

      await waitFor(() => {
        expect(onDetectCode).toHaveBeenCalledWith('https://example.com/qr')
      })
    })
  })

  describe('cleanup', () => {
    it('should stop camera on unmount', async () => {
      const videoRef = { current: mockVideoElement }
      const canvasRef = { current: mockCanvas }
      const onDetectCode = vi.fn()

      const { result, unmount } = renderHook(() => useQRCodeScanner(videoRef, canvasRef, onDetectCode))

      await act(async () => {
        await result.current.startScanning()
      })

      unmount()

      expect(mockTrack.stop).toHaveBeenCalled()
    })
  })
})
