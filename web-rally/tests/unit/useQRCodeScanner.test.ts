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
import useQRCodeScanner from '@/hooks/useQRCodeScanner'

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
}

const mockCanvasContext = {
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(640 * 480 * 4),
    width: 640,
    height: 480,
  })),
}

const mockCanvas = {
  getContext: vi.fn(() => mockCanvasContext),
  width: 0,
  height: 0,
}

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
      if (tag === 'video') return mockVideoElement as unknown as HTMLVideoElement
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement
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
      const { result } = renderHook(() => useQRCodeScanner())

      expect(result.current.isScanning).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.data).toBeNull()
    })
  })

  describe('startScanning', () => {
    it('should set isScanning to true when camera is available', async () => {
      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isScanning).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should request camera access with correct constraints', async () => {
      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'environment' },
      })
    })

    it('should set error when camera permission is denied', async () => {
      const permissionError = new DOMException('Permission denied', 'NotAllowedError')
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permissionError)

      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.error).toContain('permission')
    })

    it('should set error when no camera is found', async () => {
      const notFoundError = new DOMException('No camera', 'NotFoundError')
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(notFoundError)

      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.error).toContain('camera')
    })
  })

  describe('stopScanning', () => {
    it('should stop all camera tracks and set isScanning to false', async () => {
      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      act(() => {
        result.current.stopScanning()
      })

      expect(result.current.isScanning).toBe(false)
      expect(mockTrack.stop).toHaveBeenCalled()
    })

    it('should cancel the animation frame loop', async () => {
      const { result } = renderHook(() => useQRCodeScanner())

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
    it('should call onScan callback when QR code is detected', async () => {
      const onScan = vi.fn()
      vi.mocked(jsQR).mockReturnValue({
        data: 'https://example.com/qr',
        binaryData: new Uint8ClampedArray(),
        chunks: [],
        version: 1,
        location: {
          topRightCorner: { x: 0, y: 0 },
          topLeftCorner: { x: 0, y: 0 },
          bottomRightCorner: { x: 0, y: 0 },
          bottomLeftCorner: { x: 0, y: 0 },
        },
      })

      const { result } = renderHook(() => useQRCodeScanner({ onScan }))

      await act(async () => {
        await result.current.startScanning()
      })

      // Trigger the animation frame to process a frame
      act(() => {
        if (rafCallback) rafCallback(0)
      })

      await waitFor(() => {
        expect(onScan).toHaveBeenCalledWith('https://example.com/qr')
      })
    })

    it('should not call onScan when no QR code is detected', async () => {
      const onScan = vi.fn()
      vi.mocked(jsQR).mockReturnValue(null)

      const { result } = renderHook(() => useQRCodeScanner({ onScan }))

      await act(async () => {
        await result.current.startScanning()
      })

      act(() => {
        if (rafCallback) rafCallback(0)
      })

      expect(onScan).not.toHaveBeenCalled()
    })

    it('should set data when QR code is detected without callback', async () => {
      vi.mocked(jsQR).mockReturnValue({
        data: 'TEAM-CODE-XYZ',
        binaryData: new Uint8ClampedArray(),
        chunks: [],
        version: 1,
        location: {
          topRightCorner: { x: 0, y: 0 },
          topLeftCorner: { x: 0, y: 0 },
          bottomRightCorner: { x: 0, y: 0 },
          bottomLeftCorner: { x: 0, y: 0 },
        },
      })

      const { result } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      act(() => {
        if (rafCallback) rafCallback(0)
      })

      await waitFor(() => {
        expect(result.current.data).toBe('TEAM-CODE-XYZ')
      })
    })
  })

  describe('cleanup', () => {
    it('should stop camera on unmount', async () => {
      const { result, unmount } = renderHook(() => useQRCodeScanner())

      await act(async () => {
        await result.current.startScanning()
      })

      unmount()

      expect(mockTrack.stop).toHaveBeenCalled()
    })
  })
})
